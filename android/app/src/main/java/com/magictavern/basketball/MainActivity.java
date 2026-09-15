package com.magictavern.basketball;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.*;
import android.webkit.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import java.io.File;

/** Android capture/file/download shell. Video analysis runs on the configured server. */
public class MainActivity extends Activity {
    private WebView web;
    private ProgressBar progress;
    private String origin;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraPhoto;
    private static final int PICK = 10;
    private LinearLayout root;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        origin = getPreferences(MODE_PRIVATE).getString("server", BuildConfig.DEFAULT_SERVER);
        root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(0xfff8fafc);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(), insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        LinearLayout bar = new LinearLayout(this); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(12, 0, 12, 0);
        Button home = new Button(this); home.setText("精彩记录"); home.setOnClickListener(v -> loadHome());
        TextView label = new TextView(this); label.setText("MT 篮球 · 内测版"); label.setGravity(Gravity.CENTER); label.setTextColor(0xff0f172a);
        Button settings = new Button(this); settings.setText("设置"); settings.setOnClickListener(v -> configure());
        bar.addView(home); bar.addView(label, new LinearLayout.LayoutParams(0, -2, 1)); bar.addView(settings); root.addView(bar);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); progress.setMax(100); root.addView(progress, new LinearLayout.LayoutParams(-1, 5));
        web = new WebView(this); root.addView(web, new LinearLayout.LayoutParams(-1, 0, 1)); setContentView(root);
        WebSettings s = web.getSettings(); s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false); s.setAllowContentAccess(true); s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " MTAndroid/0.1"); s.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest r) {
                if (sameOrigin(r.getUrl())) return false;
                if (!r.isForMainFrame()) return true;
                String scheme = r.getUrl().getScheme();
                if ("https".equals(scheme) || "http".equals(scheme)) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, r.getUrl())); } catch (ActivityNotFoundException e) { toast("没有可打开链接的浏览器"); }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest r, WebResourceError e) {
                if (r.isForMainFrame()) toast("连接失败，请确认服务器在线，或在设置中更新地址");
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView v, int p) { progress.setProgress(p); progress.setVisibility(p == 100 ? View.GONE : View.VISIBLE); }
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback; cameraPhoto = null;
                String type = "*/*";
                for (String accept : params.getAcceptTypes()) if (accept.startsWith("video")) { type = "video/*"; break; } else if (accept.startsWith("image")) type = "image/*";
                Intent choose = new Intent(Intent.ACTION_OPEN_DOCUMENT); choose.addCategory(Intent.CATEGORY_OPENABLE); choose.setType(type);
                if (params.isCaptureEnabled() && "video/*".equals(type)) {
                    Intent capture = new Intent(MediaStore.ACTION_VIDEO_CAPTURE); capture.putExtra(MediaStore.EXTRA_VIDEO_QUALITY, 1); capture.putExtra(MediaStore.EXTRA_SIZE_LIMIT, 500L * 1024 * 1024);
                    if (capture.resolveActivity(getPackageManager()) != null) choose = capture;
                } else if ("image/*".equals(type)) {
                    Intent capture = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
                    if (capture.resolveActivity(getPackageManager()) != null) {
                        try {
                            File dir = new File(getCacheDir(), "capture"); dir.mkdirs();
                            File photo = File.createTempFile("portrait-", ".jpg", dir);
                            cameraPhoto = FileProvider.getUriForFile(MainActivity.this, getPackageName() + ".files", photo);
                            capture.putExtra(MediaStore.EXTRA_OUTPUT, cameraPhoto);
                            capture.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
                            capture.setClipData(ClipData.newRawUri("photo", cameraPhoto));
                            choose = Intent.createChooser(choose, "选择照片"); choose.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{capture});
                        } catch (Exception e) { cameraPhoto = null; }
                    }
                }
                try { startActivityForResult(choose, PICK); } catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null); fileCallback = null; toast("设备没有可用的文件选择器"); }
                return true;
            }
        });
        web.setDownloadListener((url, agent, disposition, mime, length) -> {
            if (!sameOrigin(Uri.parse(url))) { toast("请在浏览器下载此文件"); return; }
            if (Build.VERSION.SDK_INT <= 28 && checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, 11); toast("授权后请再次点击下载"); return;
            }
            try {
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
                String cookie = CookieManager.getInstance().getCookie(url); if (cookie != null) r.addRequestHeader("Cookie", cookie);
                r.addRequestHeader("User-Agent", agent); r.setMimeType(mime);
                String name = URLUtil.guessFileName(url, disposition, mime).replaceAll("[^\\p{L}\\p{N}._-]", "_");
                r.setTitle(name); r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, System.currentTimeMillis() + "-" + name);
                ((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r); toast("已开始下载，完成后可在下载文件夹查看");
            } catch (Exception e) { toast("下载失败，请重试"); }
        });
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, () -> { if (web.canGoBack()) web.goBack(); else finish(); });
        if (origin.isEmpty()) configure(); else if (state == null || web.restoreState(state) == null) loadHome();
    }
    private boolean sameOrigin(Uri url) {
        Uri base = Uri.parse(origin);
        return "https".equals(url.getScheme()) && base.getHost() != null && base.getHost().equalsIgnoreCase(url.getHost()) && effectivePort(base) == effectivePort(url);
    }
    private int effectivePort(Uri uri) { return uri.getPort() == -1 ? 443 : uri.getPort(); }
    private void loadHome() { if (origin.isEmpty()) configure(); else web.loadUrl(origin + "/record"); }
    private void configure() {
        EditText input = new EditText(this); input.setSingleLine(true); input.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); input.setText(origin); input.setHint("https://你的服务地址");
        AlertDialog dialog = new AlertDialog.Builder(this).setTitle("分析服务器").setMessage("视频会上传到此服务器进行分析。上传时请保持应用在前台；提交完成后可以离开。临时公网地址变化时，在这里更新。").setView(input).setPositiveButton("保存并连接", null).setNegativeButton("取消", null).create();
        dialog.setOnShowListener(d -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(v -> {
            String value = input.getText().toString().trim().replaceAll("/+$", "");
            if (!value.matches("https://[a-zA-Z0-9.-]+(:[0-9]+)?")) { input.setError("请输入 HTTPS 服务器地址，不含路径"); return; }
            origin = value; getPreferences(MODE_PRIVATE).edit().putString("server", value).apply(); web.clearHistory(); loadHome(); dialog.dismiss();
        })); dialog.show();
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK && fileCallback != null) {
            Uri[] values = null;
            if (result == RESULT_OK) { values = WebChromeClient.FileChooserParams.parseResult(result, data); if (values == null && cameraPhoto != null) values = new Uri[]{cameraPhoto}; }
            fileCallback.onReceiveValue(values); fileCallback = null; cameraPhoto = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out); web.saveState(out); }
    @Override protected void onPause() { super.onPause(); CookieManager.getInstance().flush(); }
    @Override public void onBackPressed() { if (web.canGoBack()) web.goBack(); else super.onBackPressed(); }
    @Override protected void onDestroy() { if (fileCallback != null) fileCallback.onReceiveValue(null); web.destroy(); super.onDestroy(); }
    private void toast(String text) { Toast.makeText(this, text, Toast.LENGTH_LONG).show(); }
}
