package com.courtmoments.app;

import android.app.*;
import android.os.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.provider.*;
import android.view.*;
import android.widget.*;
import androidx.core.content.FileProvider;
import com.google.zxing.*;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;
import org.json.*;
import java.io.*;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Independent native basketball app. No embedded workbench or WebView. */
public class MainActivity extends Activity {
    private static final int INK=0xff152e35, MUTED=0xff72838a, ACCENT=0xff008d79, BG=0xfff3f6f5;
    private static final int PICK_VIDEO=20, CAPTURE_VIDEO=21, PICK_PHOTO=22, CAPTURE_PHOTO=23;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private final ExecutorService images=Executors.newFixedThreadPool(2);
    private final Handler handler=new Handler(Looper.getMainLooper());
    private Api api;
    private JSONObject user, profile, detail;
    private JSONArray people=new JSONArray(), history=new JSONArray(), totals=new JSONArray();
    private LinearLayout root, body, nav;
    private TextView status, title;
    private ProgressBar progress;
    private ScrollView scroll;
    private String screen="home", activeRecord="", source="", pendingVideo="", pendingName="", pendingInvite="";
    private Uri capturedPhoto, capturedVideo;
    private File capturedVideoFile;
    private File captureFile;
    private boolean busy=false, recordingFile=false;
    private int revision=0;
    private String exportAttempt="";
    private long exportAttemptAt=0;
    interface Task<T> { T run() throws Exception; }
    interface Result<T> { void accept(T result) throws Exception; }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        api=new Api(this,getPreferences(MODE_PRIVATE).getString("server",BuildConfig.DEFAULT_SERVER));
        createLayout();readInvite(getIntent());
        if(Build.VERSION.SDK_INT>=33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::back);
        authenticateSession();
    }
    private int dp(int v){return Math.round(v*getResources().getDisplayMetrics().density);}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private TextView text(String s,int size,int color){TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setLineSpacing(dp(3),1);return t;}
    private TextView heading(String s){TextView t=text(s,23,INK);t.setTypeface(null,Typeface.BOLD);return t;}
    private void add(LinearLayout parent,View view){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.bottomMargin=dp(12);parent.addView(view,p);}
    private Button button(String label,boolean primary,Runnable action){Button b=new Button(this);b.setText(label);b.setTextSize(15);b.setAllCaps(false);b.setTextColor(primary?Color.WHITE:INK);b.setBackground(shape(primary?ACCENT:0xffe6efec,14));b.setMinHeight(dp(50));b.setPadding(dp(12),dp(8),dp(12),dp(8));b.setOnClickListener(v->{if(!busy) action.run();});return b;}
    private EditText field(String hint,String value,boolean password){EditText e=new EditText(this);e.setSingleLine(true);e.setTextSize(16);e.setHint(hint);e.setContentDescription(hint);e.setText(value);e.setPadding(dp(15),dp(12),dp(15),dp(12));e.setBackground(shape(0xffedf2f0,12));e.setInputType(password?129:1);return e;}
    private LinearLayout card(){LinearLayout c=new LinearLayout(this);c.setOrientation(LinearLayout.VERTICAL);c.setPadding(dp(20),dp(20),dp(20),dp(14));c.setBackground(shape(Color.WHITE,20));add(body,c);return c;}
    private void createLayout(){
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);
        root.setOnApplyWindowInsetsListener((v,insets)->{
            if(Build.VERSION.SDK_INT>=30){Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(i.left,i.top,i.right,i.bottom);}
            else v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());return insets;
        });
        LinearLayout top=new LinearLayout(this);top.setPadding(dp(20),dp(10),dp(12),dp(8));top.setGravity(Gravity.CENTER_VERTICAL);
        title=heading("球场时刻");top.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        Button settings=button("设置",false,this::settings);top.addView(settings,new LinearLayout.LayoutParams(dp(68),dp(40)));root.addView(top);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setIndeterminate(true);progress.setVisibility(View.GONE);root.addView(progress,new LinearLayout.LayoutParams(-1,dp(3)));
        status=text("",13,MUTED);status.setPadding(dp(20),dp(6),dp(20),dp(6));status.setVisibility(View.GONE);root.addView(status);
        scroll=new ScrollView(this);scroll.setFillViewport(true);body=new LinearLayout(this);body.setOrientation(LinearLayout.VERTICAL);body.setPadding(dp(20),dp(16),dp(20),dp(16));scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        nav=new LinearLayout(this);nav.setBackgroundColor(Color.WHITE);nav.setPadding(dp(12),dp(10),dp(12),dp(10));
        String[] labels={"精彩记录","历史","我的"}, screens={"home","history","profile"};
        for(int i=0;i<labels.length;i++){final String key=screens[i];Button b=button(labels[i],false,()->{activeRecord="";detail=null;show(key);});LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,dp(48),1);p.setMargins(dp(3),0,dp(3),0);nav.addView(b,p);}
        root.addView(nav);setContentView(root);
    }
    private <T> void run(String message,Task<T> task,Result<T> done){
        if(busy)return;busy=true;status.setTextColor(MUTED);status.setText(message);status.setVisibility(View.VISIBLE);progress.setVisibility(View.VISIBLE);
        network.execute(()->{try{T value=task.run();handler.post(()->{if(isDestroyed())return;busy=false;progress.setVisibility(View.GONE);status.setVisibility(View.GONE);try{done.accept(value);}catch(Exception e){error(e);}});}catch(Exception e){handler.post(()->{if(isDestroyed())return;busy=false;progress.setVisibility(View.GONE);error(e);});}});
    }
    private void error(Exception e){String m=e.getMessage();status.setText(m==null?"操作失败，请重试":m);status.setTextColor(0xffa64431);status.setVisibility(View.VISIBLE);}
    private void message(String s){status.setText(s);status.setTextColor(MUTED);status.setVisibility(View.VISIBLE);}
    private void authenticateSession(){
        body.removeAllViews();nav.setVisibility(View.GONE);add(body,heading("每一球，都是你的时刻"));add(body,text("正在连接…",16,MUTED));
        add(body,button("重新连接",false,this::authenticateSession));add(body,button("登录 / 注册",false,()->login(false)));
        run("正在检查登录状态",()->api.get("/api/mobile/bootstrap"),d->{user=d.optJSONObject("user");if(user==null)login(false);else applyBootstrap(d);});
    }
    private void loadData(){run("正在读取你的记录",()->api.get("/api/mobile/bootstrap"),this::applyBootstrap);}
    private void applyBootstrap(JSONObject d) throws JSONException {
        user=d.optJSONObject("user");if(user==null){login(false);return;}
        people=d.getJSONArray("players");history=d.getJSONArray("records");totals=d.getJSONArray("stats");
        pendingVideo=getPreferences(MODE_PRIVATE).getString("pending-"+user.optString("id"),"");pendingName=getPreferences(MODE_PRIVATE).getString("pending-name-"+user.optString("id"),"已上传视频");if(!pendingVideo.isEmpty())source="upload";
        JSONObject mine=d.optJSONObject("profile");if(mine!=null)getPreferences(MODE_PRIVATE).edit().putString("profile-"+user.optString("id"),mine.optString("id")).apply();selectMyProfile();if(!pendingInvite.isEmpty())joinScreen();else show("home");
    }
    private void selectMyProfile(){
        String id=getPreferences(MODE_PRIVATE).getString("profile-"+user.optString("id"),"");profile=null;
        for(int i=0;i<people.length();i++){JSONObject p=people.optJSONObject(i);if(p.optString("id").equals(id)&&!p.optBoolean("archived"))profile=p;}
        if(profile==null)for(int i=0;i<history.length();i++){JSONObject r=history.optJSONObject(i);if("personal".equals(r.optString("mode"))){String old=r.optJSONArray("members").optJSONObject(0).optString("personId");for(int j=0;j<people.length();j++)if(people.optJSONObject(j).optString("id").equals(old))profile=people.optJSONObject(j);if(profile!=null)break;}}
    }
    private void login(boolean register){
        revision++;screen="login";body.removeAllViews();nav.setVisibility(View.GONE);title.setText("球场时刻");
        LinearLayout hero=card();hero.setBackground(shape(INK,22));add(hero,text("COURT MOMENTS",12,0xff78d6bd));add(hero,text(register?"你的篮球故事\n从这一刻开始":"欢迎回来\n继续你的篮球故事",29,Color.WHITE));
        LinearLayout c=card();add(c,heading(register?"创建账号":"登录账号"));EditText name=field("用户名（2–30 位）","",false),password=field("密码（至少 8 位）","",true);add(c,name);add(c,password);
        add(c,button(register?"注册并开始":"登录",true,()->run("正在登录",()->api.post("/api/auth",Api.object("action",register?"register":"login","username",name.getText().toString().trim(),"password",password.getText().toString())),d->{user=d.getJSONObject("user");password.setText("");loadData();})));
        add(c,button(register?"已有账号，去登录":"首次使用，创建账号",false,()->login(!register)));
        add(c,text("独立账号 · 私有记录\n你的档案、比赛和集锦，由你管理。",12,MUTED));
    }
    private void show(String which){
        revision++;screen=which;if(!busy)status.setVisibility(View.GONE);highlightNav(which);handler.removeCallbacks(poll);body.removeAllViews();nav.setVisibility(user==null?View.GONE:View.VISIBLE);title.setText("球场时刻");scroll.scrollTo(0,0);
        if("home".equals(which))home();else if("history".equals(which))historyScreen();else if("profile".equals(which))profileScreen();else if("mode".equals(which))modeScreen();
    }
    private void highlightNav(String which){int selected="history".equals(which)?1:"profile".equals(which)?2:0;for(int i=0;i<nav.getChildCount();i++){Button b=(Button)nav.getChildAt(i);b.setBackground(shape(i==selected?ACCENT:0xffe6efec,14));b.setTextColor(i==selected?Color.WHITE:INK);}}
    private void home(){
        LinearLayout hero=card();hero.setBackground(shape(INK,22));add(hero,text("MAKE IT YOUR MOMENT",12,0xff78d6bd));add(hero,text("每一球\n都是你的时刻",34,Color.WHITE));add(hero,text("把投入留在场上，把精彩带走。",14,0xffbdd3cf));
        if(!pendingVideo.isEmpty())add(body,button("继续未完成的记录 · "+pendingName,false,()->{source="upload";show("mode");}));
        add(body,heading("开启精彩记录"));
        LinearLayout live=card();add(live,text("01  ·  LIVE",12,ACCENT));add(live,heading("现场拍摄"));add(live,text("选择个人或团队，确认名单后开拍。",14,MUTED));add(live,button("开始记录",true,()->{source="camera";pendingVideo="";activeRecord="";show("mode");}));
        LinearLayout upload=card();add(upload,text("02  ·  FROM YOUR GALLERY",12,ACCENT));add(upload,heading("上传视频"));add(upload,text("先上传已有视频，再选择个人或团队。",14,MUTED));add(upload,button("选择比赛视频",false,()->{activeRecord="";pickVideo(false);}));
        add(body,button("加入朋友的球局",false,this::joinCode));
    }
    private void modeScreen(){
        add(body,heading("这次，记录谁的精彩？"));if(!pendingVideo.isEmpty())add(body,text("已上传："+pendingName,14,ACCENT));
        LinearLayout personal=card();add(personal,text("个人记录",24,INK));add(personal,text("你的得分、进球与专属集锦。",14,MUTED));
        if(profile!=null){portrait(personal,profile,76);add(personal,text("默认沿用上次选择的照片",12,MUTED));add(personal,button("修改照片 / 选择历史照片",false,()->photoOptions(profile)));}
        add(personal,button(profile==null?"先创建我的档案":"确认个人记录",true,()->{if(profile==null){show("profile");return;}createRecord(false,"我的精彩记录","A队","B队");}));
        LinearLayout team=card();add(team,text("团队记录",24,INK));add(team,text("创建球局，邀请成员加入两队。",14,MUTED));EditText name=field("球局名称（选填）","",false),a=field("球队 A","A队",false),b=field("球队 B","B队",false);add(team,name);add(team,a);add(team,b);add(team,button("创建球局",true,()->createRecord(true,name.getText().toString(),a.getText().toString(),b.getText().toString())));
        add(body,button("返回",false,()->show("home")));
    }
    private void createRecord(boolean team,String name,String a,String b){
        run("正在创建记录",()->{
            JSONArray members=new JSONArray();if(!team)members.put(Api.object("personId",profile.getString("id"),"team","A"));
            JSONObject data=Api.object("mode",team?"team":"personal","title",name,"teams",new JSONArray().put(a).put(b),"members",members);if(!pendingVideo.isEmpty())data.put("draftVideoId",pendingVideo);
            return api.post("/api/recordings",data);
        },r->{getPreferences(MODE_PRIVATE).edit().remove("pending-"+user.optString("id")).remove("pending-name-"+user.optString("id")).apply();activeRecord=r.getString("id");openRecord(activeRecord);});
    }
    private void profileScreen(){
        add(body,heading("我的个人档案"));add(body,text("真实的你，和每一次上场。",14,MUTED));LinearLayout c=card();if(profile!=null)portrait(c,profile,100);
        EditText name=field("你的名字",profile==null?"":profile.optString("name"),false),number=field("球衣号码（选填）",profile==null?"":profile.optString("jerseyNumber"),false);add(c,name);add(c,number);
        add(c,button("保存档案",true,()->run("正在保存档案",()->{
            JSONObject fields=Api.object("name",name.getText().toString().trim(),"jerseyNumber",number.getText().toString().trim());String id;
            id=api.post("/api/me/profile",fields).getString("id");
            getPreferences(MODE_PRIVATE).edit().putString("profile-"+user.optString("id"),id).apply();return api.get("/api/players").getJSONArray("players");
        },p->{people=p;selectMyProfile();show("profile");message("档案已保存");})));
        if(people.length()>0)add(c,button("使用已有档案",false,()->{ArrayList<JSONObject> available=new ArrayList<>();for(int i=0;i<people.length();i++){JSONObject p=people.optJSONObject(i);if(p.optBoolean("roster")&&!p.optBoolean("archived"))available.add(p);}String[] names=new String[available.size()];for(int i=0;i<names.length;i++)names[i]=available.get(i).optString("name");new AlertDialog.Builder(this).setTitle("选择我的档案").setItems(names,(d,n)->run("正在切换档案",()->api.post("/api/me/profile",Api.object("personId",available.get(n).getString("id"))),r->{getPreferences(MODE_PRIVATE).edit().putString("profile-"+user.optString("id"),r.getString("id")).apply();selectMyProfile();show("profile");})).show();}));
        if(profile!=null)add(c,button("拍照 / 上传 / 历史照片",false,()->photoOptions(profile)));
        if(!source.isEmpty()&&profile!=null)add(body,button("继续精彩记录",true,()->show("mode")));
        if(!pendingInvite.isEmpty()&&profile!=null)add(body,button("继续加入球局",true,this::joinScreen));
        if(profile!=null){LinearLayout data=card();add(data,heading("我的累计表现"));TextView total=text("读取统计中…",16,INK);add(data,total);final String person=profile.optString("id");images.execute(()->{try{JSONArray all=api.get("/api/players").getJSONArray("stats");JSONObject found=null;for(int i=0;i<all.length();i++)if(person.equals(all.optJSONObject(i).optString("id")))found=all.optJSONObject(i);JSONObject stat=found;handler.post(()->{if(stat!=null)total.setText(stat.optInt("knownPoints")+" 分 · "+stat.optInt("made")+" 球 · "+stat.optInt("videos")+" 段视频"+(stat.optInt("unknownValue")>0?"\n另有 "+stat.optInt("unknownValue")+" 个进球待判分":""));else total.setText("记录你的第一场比赛后，累计数据会显示在这里。");});}catch(Exception e){handler.post(()->total.setText("统计暂时无法读取，请稍后再试"));}});}
        add(body,text("账号："+user.optString("username"),13,MUTED));
        add(body,button("退出登录",false,()->run("正在退出",()->api.post("/api/auth",Api.object("action","logout")),d->{api.clearSession();user=null;profile=null;people=new JSONArray();history=new JSONArray();activeRecord="";pendingVideo="";login(false);})));
    }
    private void portrait(LinearLayout parent,JSONObject person,int size){
        LinearLayout row=new LinearLayout(this);row.setGravity(Gravity.CENTER_VERTICAL);ImageView img=new ImageView(this);img.setBackground(shape(0xffdcebe5,18));img.setScaleType(ImageView.ScaleType.CENTER_CROP);row.addView(img,new LinearLayout.LayoutParams(dp(size),dp(size)));TextView name=text("  "+person.optString("name")+"\n  "+(person.optString("jerseyNumber").isEmpty()?"篮球爱好者":person.optString("jerseyNumber")+" 号"),17,INK);row.addView(name,new LinearLayout.LayoutParams(0,-2,1));add(parent,row);loadImage(img,person.optString("photo"));
    }
    private void loadImage(ImageView img,String path){if(!path.startsWith("/api/player-photos/"))return;final Api current=api;images.execute(()->{try{byte[] b=current.request("GET",path,null,null,null);Bitmap bitmap=BitmapFactory.decodeByteArray(b,0,b.length);handler.post(()->{if(!isDestroyed()&&api==current)img.setImageBitmap(bitmap);});}catch(Exception ignored){}});}
    private String photoPerson="";
    private void photoOptions(JSONObject target){photoPerson=target.optString("id");new AlertDialog.Builder(this).setTitle("本次使用的照片").setItems(new String[]{"拍摄新照片","从相册上传","选择历史照片"},(d,n)->{if(n==2)historyPhotos(target);else choosePhoto(n==0);}).show();}
    private void historyPhotos(JSONObject target){
        JSONArray photos=target.optJSONArray("referencePhotos");if(photos==null||photos.length()==0){message("还没有历史照片，先拍摄或上传一张。");return;}
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),dp(10),dp(20),dp(10));AlertDialog dialog=new AlertDialog.Builder(this).setTitle("选择历史照片").setView(box).setNegativeButton("返回",null).create();
        for(int i=0;i<photos.length();i++){JSONObject p=photos.optJSONObject(i);ImageView img=new ImageView(this);img.setScaleType(ImageView.ScaleType.CENTER_CROP);box.addView(img,new LinearLayout.LayoutParams(-1,dp(110)));loadImage(img,p.optString("url"));img.setOnClickListener(v->{dialog.dismiss();saveCover(target.optString("id"),p.optString("id"));});}ScrollView sc=new ScrollView(this);sc.addView(box);dialog.setView(sc);dialog.show();
    }
    private void saveCover(String id,String photo){run("正在更新照片",()->{api.json("PATCH","/api/players",Api.object("type","cover","id",id,"photoId",photo));return api.get("/api/players").getJSONArray("players");},p->{people=p;selectMyProfile();if("mode".equals(screen))show("mode");else if(!activeRecord.isEmpty())openRecord(activeRecord);else show("profile");});}
    private void openMedia(String type,int code){
        Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT);intent.setType(type);intent.addCategory(Intent.CATEGORY_OPENABLE);
        try{startActivityForResult(intent,code);}catch(ActivityNotFoundException missing){intent.setAction(Intent.ACTION_GET_CONTENT);startActivityForResult(intent,code);}
    }
    private void choosePhoto(boolean camera){
        try{if(camera){File dir=new File(getCacheDir(),"capture");dir.mkdirs();captureFile=File.createTempFile("portrait-",".jpg",dir);capturedPhoto=FileProvider.getUriForFile(this,getPackageName()+".files",captureFile);Intent i=new Intent(MediaStore.ACTION_IMAGE_CAPTURE);i.putExtra(MediaStore.EXTRA_OUTPUT,capturedPhoto);i.setClipData(ClipData.newRawUri("photo",capturedPhoto));i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivityForResult(i,CAPTURE_PHOTO);}else{openMedia("image/*",PICK_PHOTO);}}catch(Exception e){error(new IOException("无法打开相机或相册，请尝试其他方式"));}
    }
    private Uri videoOutput() throws IOException {
        String name="CourtMoments-"+System.currentTimeMillis()+".mp4";
        if(Build.VERSION.SDK_INT>=29){ContentValues values=new ContentValues();values.put(MediaStore.Video.Media.DISPLAY_NAME,name);values.put(MediaStore.Video.Media.MIME_TYPE,"video/mp4");values.put(MediaStore.Video.Media.RELATIVE_PATH,Environment.DIRECTORY_MOVIES+"/CourtMoments");Uri uri=getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI,values);if(uri==null)throw new IOException("无法创建录像文件");return uri;}
        File folder=getExternalFilesDir(Environment.DIRECTORY_MOVIES);if(folder==null)throw new IOException("手机存储暂时不可用");folder.mkdirs();capturedVideoFile=new File(folder,name);return FileProvider.getUriForFile(this,getPackageName()+".files",capturedVideoFile);
    }
    private void finishCapture(boolean keep){
        if(capturedVideo==null)return;
        try{if(Build.VERSION.SDK_INT>=29){if(keep){ContentValues v=new ContentValues();v.put(MediaStore.Video.Media.IS_PENDING,0);getContentResolver().update(capturedVideo,v,null,null);}else getContentResolver().delete(capturedVideo,null,null);}else if(!keep&&capturedVideoFile!=null)capturedVideoFile.delete();}catch(Exception ignored){}
    }
    private void pickVideo(boolean camera){
        recordingFile=!activeRecord.isEmpty();try{Intent i;if(camera){i=new Intent(MediaStore.ACTION_VIDEO_CAPTURE);i.putExtra(MediaStore.EXTRA_VIDEO_QUALITY,1);i.putExtra(MediaStore.EXTRA_SIZE_LIMIT,500L*1024*1024);capturedVideo=videoOutput();i.putExtra(MediaStore.EXTRA_OUTPUT,capturedVideo);i.setClipData(ClipData.newRawUri("video",capturedVideo));i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION|Intent.FLAG_GRANT_READ_URI_PERMISSION);}else{openMedia("video/*",PICK_VIDEO);return;}startActivityForResult(i,CAPTURE_VIDEO);}catch(Exception e){if(camera){finishCapture(false);capturedVideo=null;}error(new IOException("无法打开相机或文件选择器，请尝试上传已有视频"));}
    }
    @Override protected void onActivityResult(int code,int result,Intent data){super.onActivityResult(code,result,data);if(result!=RESULT_OK){if(code==CAPTURE_VIDEO){finishCapture(false);capturedVideo=null;}return;}Uri uri=data==null?null:data.getData();if(code==CAPTURE_PHOTO)uri=capturedPhoto;if(code==CAPTURE_VIDEO&&capturedVideo!=null){if(uri==null||uri.equals(capturedVideo)){uri=capturedVideo;finishCapture(true);}else finishCapture(false);capturedVideo=null;}if(uri==null){message("没有取得文件，请重新选择");return;}final Uri chosen=uri;
        if(code==PICK_PHOTO||code==CAPTURE_PHOTO){final String person=photoPerson;run("正在上传照片",()->{byte[] raw=Api.read(getContentResolver().openInputStream(chosen),10*1024*1024);JSONObject p=new JSONObject(new String(api.request("POST","/api/players/"+person+"/photos",raw,"application/octet-stream",null),java.nio.charset.StandardCharsets.UTF_8));api.json("PATCH","/api/players",Api.object("type","cover","id",person,"photoId",p.getString("id")));return api.get("/api/players").getJSONArray("players");},p->{people=p;selectMyProfile();if(captureFile!=null){captureFile.delete();captureFile=null;}if("mode".equals(screen))show("mode");else if(!activeRecord.isEmpty())openRecord(activeRecord);else show("profile");});}
        else if(code==PICK_VIDEO||code==CAPTURE_VIDEO)uploadVideo(chosen);
    }
    private void uploadVideo(Uri uri){final String record=recordingFile?activeRecord:"";run("正在准备视频，请保持应用在前台",()->{
        File tmp=File.createTempFile("upload-",".video",getCacheDir());String name="比赛视频.mp4";
        try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}catch(Exception ignored){}
        String uploadId=null;
        try{
            try(InputStream in=getContentResolver().openInputStream(uri);OutputStream out=new FileOutputStream(tmp)){byte[] b=new byte[65536];int n;long total=0;while((n=in.read(b))!=-1){total+=n;if(total>500L*1024*1024)throw new IOException("视频超过 500 MB，请截取后上传");out.write(b,0,n);}}
            JSONObject session=api.post("/api/uploads",Api.object("name",name,"size",tmp.length()));uploadId=session.getString("id");int chunk=session.getInt("chunkSize"),count=session.getInt("count");
            try(InputStream in=new FileInputStream(tmp)){for(int i=0;i<count;i++){int length=(int)Math.min(chunk,tmp.length()-(long)i*chunk);byte[] data=new byte[length];int offset=0,n;while(offset<length&&(n=in.read(data,offset,length-offset))!=-1)offset+=n;if(offset!=length)throw new IOException("无法读取完整视频");StringBuilder hash=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(data))hash.append(String.format(Locale.US,"%02x",b&255));Exception failure=null;for(int attempt=0;attempt<3;attempt++){try{api.request("PUT","/api/uploads/"+uploadId+"?index="+i,data,"application/octet-stream",hash.toString());failure=null;break;}catch(Exception e){failure=e;}}if(failure!=null)throw failure;final int pct=Math.round((i+1)*99f/count);handler.post(()->message("正在上传 "+pct+"% · 请保持前台"));}}
            JSONObject video=((JSONObject)api.json("PATCH","/api/uploads/"+uploadId,null)).getJSONObject("video");return video;
        }catch(Exception e){if(uploadId!=null)try{api.json("DELETE","/api/uploads/"+uploadId,null);}catch(Exception ignored){}throw e;}finally{tmp.delete();}
    },video->{pendingVideo=video.getString("id");pendingName=video.optString("name");if(!record.isEmpty()){activeRecord=record;startRecord(pendingVideo);}else{getPreferences(MODE_PRIVATE).edit().putString("pending-"+user.optString("id"),pendingVideo).putString("pending-name-"+user.optString("id"),pendingName).apply();source="upload";show("mode");}});}
    private void historyScreen(){add(body,heading("我的比赛记录"));add(body,text("每次上场，都有迹可循。",14,MUTED));add(body,button("刷新记录",false,()->run("正在读取历史",()->(JSONArray)api.json("GET","/api/recordings",null),h->{history=h;show("history");})));if(history.length()==0)add(body,text("还没有记录，开始你的第一场吧。",16,MUTED));for(int i=0;i<history.length();i++){JSONObject r=history.optJSONObject(i);LinearLayout c=card();add(c,text("personal".equals(r.optString("mode"))?"个人记录":"团队记录",12,ACCENT));add(c,heading(r.optString("title")));add(c,text(r.optString("createdAt").replace('T',' ').substring(0,16),12,MUTED));add(c,button("查看记录",false,()->openRecord(r.optString("id"))));}}
    private void openRecord(String id){handler.removeCallbacks(poll);activeRecord=id;run("正在读取比赛",()->api.get("/api/recordings/"+id),d->{detail=d;screen="record";renderRecord(false);handler.postDelayed(poll,4000);});}
    private final Runnable poll=()->{if(!"record".equals(screen)||activeRecord.isEmpty())return;if(busy){handler.removeCallbacks(this.poll);handler.postDelayed(this.poll,4000);return;}final String id=activeRecord;network.execute(()->{try{JSONObject d=api.get("/api/recordings/"+id);handler.post(()->{if(isDestroyed()||!"record".equals(screen)||!id.equals(activeRecord))return;detail=d;renderRecord(true);autoExport();handler.removeCallbacks(this.poll);handler.postDelayed(this.poll,4000);});}catch(Exception e){handler.post(()->{if("record".equals(screen)&&id.equals(activeRecord)){error(e);handler.postDelayed(this.poll,8000);}});}});};
    private void startRecord(String video){run("正在提交分析和剪辑",()->api.post("/api/recordings/"+activeRecord,Api.object("videoId",video)),d->{openRecord(activeRecord);JSONArray errors=d.optJSONArray("errors");if(errors!=null&&errors.length()>0)message(errors.toString());});}
    private void renderRecord(boolean preserve){
        int y=scroll.getScrollY();highlightNav("home");revision++;body.removeAllViews();nav.setVisibility(View.VISIBLE);JSONObject r=detail.optJSONObject("record"),video=detail.optJSONObject("video");if(r==null)return;boolean team="team".equals(r.optString("mode"));JSONArray members=detail.optJSONArray("members"),teams=r.optJSONArray("teams");add(body,text(team?"TEAM GAME":"PERSONAL MOMENT",12,ACCENT));add(body,heading(r.optString("title")));
        if(team)add(body,text(teams.optString(0)+"  VS  "+teams.optString(1),17,MUTED));
        LinearLayout roster=card();add(roster,heading(team?"本场阵容":"记录对象"));for(int i=0;i<members.length();i++){JSONObject m=members.optJSONObject(i);add(roster,text(m.optString("name")+(team?" · "+teams.optString("B".equals(m.optString("team"))?1:0):""),16,INK));}
        if(video==null){
            if(team){add(roster,button("添加 / 管理成员",false,this::manageMembers));add(roster,button("邀请朋友 · 球局二维码",false,this::inviteDialog));}
            String draft=r.optString("draftVideoId","");if(!draft.isEmpty()){pendingVideo=draft;add(body,button("开始分析与自动剪辑",true,()->startRecord(draft)));}else{add(body,button("开启摄像头",true,()->{if(team&&!teamsReady(members)){message("请先为两队各添加至少一位成员");return;}pickVideo(true);}));add(body,button("上传已有视频",false,()->{if(team&&!teamsReady(members)){message("请先为两队各添加至少一位成员");return;}pickVideo(false);}));}
            add(body,text("拍摄结束后会上传并自动分析。请固定机位，完整拍到篮筐和球员。单段最大 500 MB。",13,MUTED));
        }else{
            LinearLayout scores=card();add(scores,heading(team?"两队表现":"我的表现"));
            boolean analyzed="complete".equals(video.optString("status"));
            if(analyzed){
            if(team){for(int t=0;t<2;t++){int points=0;for(int i=0;i<members.length();i++){JSONObject m=members.optJSONObject(i);if((t==0?"A":"B").equals(m.optString("team")))points+=m.optInt("knownPoints");}add(scores,text(teams.optString(t)+"    "+points+" 分（已判定）",23,INK));}}
            for(int i=0;i<members.length();i++){JSONObject m=members.optJSONObject(i);add(scores,text(m.optString("name")+"    "+m.optInt("knownPoints")+" 分 · "+m.optInt("made")+" 球"+(m.optInt("unknownValue")>0?" · "+m.optInt("unknownValue")+" 球待判分":""),16,INK));}
            }else add(scores,text("等待分析完成后显示得分与进球数据。",16,MUTED));
            add(scores,text("分析状态："+statusLabel(video.optString("status")),13,MUTED));if(analyzed)add(scores,text(detail.optInt("unmatched")+" 个候选进球尚未关联到本场成员。当前照片用于档案，自动认人与分值判断仍需核对。",12,MUTED));
            if(analyzed)add(scores,button("核对球员归属",false,this::identityDialog));
            add(scores,button("重试未完成任务",false,()->startRecord(video.optString("id"))));
            JSONObject h=detail.optJSONObject("highlights"),scope=detail.optJSONObject("scope"),selection=scope==null?null:scope.optJSONObject("selection");
            LinearLayout highlights=card();add(highlights,heading(team?"本场精彩":"我的精彩"));
            if(selection!=null&&"complete".equals(selection.optJSONObject("progress").optString("status"))){String url="/api/videos/"+video.optString("id")+"/highlights/media?selection="+selection.optString("key");add(highlights,button("播放专属集锦",true,()->play(url)));add(highlights,button("保存专属集锦到手机",false,()->download(url)));}
            else add(highlights,text(selection==null?"明确关联到本场成员后，将自动合成专属集锦。":selection.optJSONObject("progress").optString("message","正在合成"),14,MUTED));
            JSONObject result=h==null?null:h.optJSONObject("result");if(result!=null&&result.optJSONArray("clips")!=null&&result.optJSONArray("clips").length()>0){String url="/api/videos/"+video.optString("id")+"/highlights/media";add(highlights,button("播放本视频全部进球",false,()->play(url)));add(highlights,button("选择片段导出",false,()->selectClips(video.optString("id"),result)));add(highlights,button("下载全部进球",false,()->download(url)));}else add(highlights,text(h!=null&&h.optJSONObject("progress")!=null?h.optJSONObject("progress").optString("message"):"剪辑等待启动",13,MUTED));
        }
        add(body,button("返回精彩记录",false,()->{activeRecord="";detail=null;source="";pendingVideo="";show("home");}));if(preserve)scroll.post(()->scroll.scrollTo(0,y));
    }
    private boolean teamsReady(JSONArray members){boolean a=false,b=false;for(int i=0;i<members.length();i++){a|="A".equals(members.optJSONObject(i).optString("team"));b|="B".equals(members.optJSONObject(i).optString("team"));}return a&&b;}
    private String statusLabel(String s){switch(s){case "queued":return "排队中";case "running":return "分析中";case "complete":return "分析完成";case "failed":return "分析失败";case "cancelled":return "已取消";default:return "待启动";}}
    private void autoExport(){JSONObject scope=detail.optJSONObject("scope"),video=detail.optJSONObject("video"),h=detail.optJSONObject("highlights");if(scope==null||video==null||!"complete".equals(video.optString("status"))||h==null||h.optJSONObject("progress")==null||!"complete".equals(h.optJSONObject("progress").optString("status"))||scope.optJSONArray("files").length()==0||scope.optJSONObject("selection")!=null)return;String signature=activeRecord+scope.optString("signature");if(signature.equals(exportAttempt)&&System.currentTimeMillis()-exportAttemptAt<30000)return;exportAttempt=signature;exportAttemptAt=System.currentTimeMillis();final String id=activeRecord;network.execute(()->{try{api.post("/api/recordings/"+id,Api.object("action","export"));}catch(Exception ignored){}});}
    private void manageMembers(){new AlertDialog.Builder(this).setTitle("管理本场阵容").setItems(new String[]{"选择已有球员","代录新成员","移除成员","更新成员照片"},(d,n)->{if(n==0)chooseMember();else if(n==1)newMember();else if(n==2)removeMember();else memberPhotos();}).show();}
    private void memberPhotos(){run("正在读取成员档案",()->api.get("/api/players").getJSONArray("players"),p->{people=p;JSONArray members=detail.optJSONArray("members");String[] labels=new String[members.length()];for(int i=0;i<labels.length;i++)labels[i]=members.optJSONObject(i).optString("name");new AlertDialog.Builder(this).setTitle("选择成员").setItems(labels,(d,n)->{String id=members.optJSONObject(n).optString("personId");for(int i=0;i<people.length();i++)if(id.equals(people.optJSONObject(i).optString("id")))photoOptions(people.optJSONObject(i));}).show();});}
    private void chooseMember(){run("正在读取球员",()->api.get("/api/players").getJSONArray("players"),p->{people=p;ArrayList<JSONObject> choices=new ArrayList<>();JSONArray members=detail.optJSONObject("record").optJSONArray("members");for(int i=0;i<p.length();i++){JSONObject person=p.optJSONObject(i);boolean included=false;for(int j=0;j<members.length();j++)included|=members.optJSONObject(j).optString("personId").equals(person.optString("id"));if(!included&&person.optBoolean("roster")&&!person.optBoolean("archived"))choices.add(person);}if(choices.isEmpty()){newMember();return;}String[] labels=new String[choices.size()];for(int i=0;i<labels.length;i++)labels[i]=choices.get(i).optString("name");new AlertDialog.Builder(this).setTitle("选择球员").setItems(labels,(d,n)->chooseTeam(choices.get(n))).show();});}
    private void newMember(){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),dp(10),dp(20),dp(10));EditText name=field("球员姓名","",false),number=field("号码（选填）","",false);add(box,name);add(box,number);new AlertDialog.Builder(this).setTitle("代录成员").setView(box).setNegativeButton("取消",null).setPositiveButton("保存",(d,w)->run("正在创建成员",()->api.post("/api/players",Api.object("name",name.getText().toString().trim(),"jerseyNumber",number.getText().toString().trim())),p->chooseTeam(Api.object("id",p.getString("id"),"name",name.getText().toString())))).show();}
    private void chooseTeam(JSONObject person){JSONArray teams=detail.optJSONObject("record").optJSONArray("teams");new AlertDialog.Builder(this).setTitle("加入哪支球队？").setItems(new String[]{teams.optString(0),teams.optString(1)},(d,n)->run("正在添加成员",()->{JSONObject latest=api.get("/api/recordings/"+activeRecord);JSONArray members=latest.getJSONObject("record").getJSONArray("members");members.put(Api.object("personId",person.getString("id"),"team",n==0?"A":"B"));return api.post("/api/recordings/"+activeRecord,Api.object("action","members","members",members));},r->openRecord(activeRecord))).show();}
    private void removeMember(){JSONArray members=detail.optJSONArray("members");String[] labels=new String[members.length()];for(int i=0;i<labels.length;i++)labels[i]=members.optJSONObject(i).optString("name");new AlertDialog.Builder(this).setTitle("移除成员").setItems(labels,(d,n)->run("正在更新名单",()->{JSONObject latest=api.get("/api/recordings/"+activeRecord);JSONArray old=latest.getJSONObject("record").getJSONArray("members"),next=new JSONArray();for(int i=0;i<old.length();i++)if(!old.getJSONObject(i).getString("personId").equals(members.getJSONObject(n).getString("personId")))next.put(old.getJSONObject(i));return api.post("/api/recordings/"+activeRecord,Api.object("action","members","members",next));},r->openRecord(activeRecord))).show();}
    private void inviteDialog(){String token=detail.optJSONObject("record").optString("invite"),url=api.origin+"/join?invite="+token;LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(20),dp(20),dp(20),dp(10));ImageView image=new ImageView(this);try{BitMatrix matrix=new QRCodeWriter().encode(url,BarcodeFormat.QR_CODE,500,500);Bitmap bitmap=Bitmap.createBitmap(500,500,Bitmap.Config.RGB_565);for(int x=0;x<500;x++)for(int y=0;y<500;y++)bitmap.setPixel(x,y,matrix.get(x,y)?INK:Color.WHITE);image.setImageBitmap(bitmap);}catch(Exception e){error(e);}box.addView(image,new LinearLayout.LayoutParams(-1,dp(260)));add(box,text("成员扫码填写资料，或在 App 中粘贴邀请链接。",14,MUTED));new AlertDialog.Builder(this).setTitle("邀请队友加入").setView(box).setPositiveButton("分享邀请",(d,w)->{Intent send=new Intent(Intent.ACTION_SEND);send.setType("text/plain");send.putExtra(Intent.EXTRA_TEXT,"来球场时刻加入我们的球局："+url);startActivity(Intent.createChooser(send,"分享球局"));}).setNeutralButton("复制链接",(d,w)->{((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("球局邀请",url));message("邀请链接已复制");}).setNegativeButton("关闭",null).show();}
    private void joinCode(){EditText input=field("粘贴球局邀请链接或邀请码","",false);new AlertDialog.Builder(this).setTitle("加入球局").setView(input).setPositiveButton("继续",(d,w)->{String value=input.getText().toString().trim();try{String token=value.contains("://")?Uri.parse(value).getQueryParameter("invite"):value;if(token==null||!token.matches("[a-f0-9]{48}"))throw new Exception();pendingInvite=token;joinScreen();}catch(Exception e){message("邀请链接无效");}}).setNegativeButton("取消",null).show();}
    private void joinScreen(){if(profile==null){show("profile");message("请先创建自己的档案，再加入球局");return;}run("正在读取球局",()->api.get("/api/recordings/invite/"+pendingInvite),invite->{if(invite.optBoolean("closed")){message("球局已开始，邀请已关闭");return;}JSONArray teams=invite.getJSONArray("teams");new AlertDialog.Builder(this).setTitle(invite.optString("title")).setMessage("将姓名、号码和当前照片提供给球局创建者。选择加入的球队：").setPositiveButton(teams.optString(0),(d,n)->joinTeam("A")).setNeutralButton(teams.optString(1),(d,n)->joinTeam("B")).setNegativeButton("取消",null).show();});}
    private void joinTeam(String team){run("正在加入球局",()->api.post("/api/recordings/invite/"+pendingInvite,Api.object("personId",profile.getString("id"),"team",team)),d->{pendingInvite="";show("home");message("已加入球局，等待创建者开始记录");});}
    private void readInvite(Intent intent){Uri u=intent==null?null:intent.getData();if(u!=null&&"courtmoments".equals(u.getScheme())&&"join".equals(u.getHost())){String token=u.getQueryParameter("invite");if(token!=null&&token.matches("[a-f0-9]{48}"))pendingInvite=token;}}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent);setIntent(intent);readInvite(intent);if(user!=null&&!pendingInvite.isEmpty()&&!busy)joinScreen();}
    private void play(String path){VideoView video=new VideoView(this);MediaController controls=new MediaController(this);controls.setAnchorView(video);video.setMediaController(controls);Map<String,String> headers=new HashMap<>();headers.put("Cookie",api.cookie());video.setVideoURI(Uri.parse(api.origin+path),headers);AlertDialog dialog=new AlertDialog.Builder(this).setView(video).setPositiveButton("关闭",(d,w)->video.stopPlayback()).create();dialog.setOnDismissListener(d->video.stopPlayback());video.setOnErrorListener((mp,a,b)->{message("暂时无法播放，可下载后查看");return true;});video.setOnPreparedListener(mp->video.start());dialog.show();dialog.getWindow().setLayout(-1,dp(360));}
    private void download(String path){if(Build.VERSION.SDK_INT<=28&&checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE},40);message("允许存储权限后再次点击下载");return;}try{DownloadManager.Request r=new DownloadManager.Request(Uri.parse(api.origin+path+(path.contains("?")?"&":"?")+"download=1"));r.addRequestHeader("Cookie",api.cookie());r.setMimeType("video/mp4");r.setTitle("球场时刻 · 进球集锦");r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS,"CourtMoments-"+System.currentTimeMillis()+".mp4");((DownloadManager)getSystemService(DOWNLOAD_SERVICE)).enqueue(r);message("已开始下载，可在手机的下载文件夹查看");}catch(Exception e){error(e);}}
    private void selectClips(String video,JSONObject result){JSONArray clips=result.optJSONArray("clips");String[] labels=new String[clips.length()];boolean[] selected=new boolean[clips.length()];Arrays.fill(selected,true);for(int i=0;i<labels.length;i++){JSONObject c=clips.optJSONObject(i);labels[i]="片段 "+(i+1)+" · "+Math.round(c.optDouble("start"))+"–"+Math.round(c.optDouble("end"))+" 秒";}new AlertDialog.Builder(this).setTitle("选择要导出的片段").setMultiChoiceItems(labels,selected,(d,n,on)->selected[n]=on).setPositiveButton("合成并下载",(d,w)->run("正在合成所选片段",()->{JSONArray files=new JSONArray();for(int i=0;i<selected.length;i++)if(selected[i])files.put(clips.getJSONObject(i).getString("file"));JSONObject job=api.post("/api/videos/"+video+"/highlights/selection",Api.object("files",files,"generation",result.optString("generation","original")));return job;},job->pollExport(video,job.getString("key"),0))).setNegativeButton("取消",null).show();}
    private void pollExport(String video,String key,int attempts){if(isDestroyed())return;network.execute(()->{try{JSONObject s=api.get("/api/videos/"+video+"/highlights/selection?key="+key);handler.post(()->{if("complete".equals(s.optString("status")))download("/api/videos/"+video+"/highlights/media?selection="+key);else if("failed".equals(s.optString("status")))message(s.optString("message"));else if(attempts<300){message("正在导出选中片段…");handler.postDelayed(()->pollExport(video,key,attempts+1),2000);}else message("导出仍在处理，请稍后重试查看");});}catch(Exception e){handler.post(()->error(e));}});}
    private void identityDialog(){JSONObject video=detail.optJSONObject("video");if(video==null)return;String id=video.optString("id");run("正在读取检测球员",()->api.get("/api/workbench"),work->{JSONArray videos=work.getJSONArray("videos");JSONObject target=null;for(int i=0;i<videos.length();i++)if(videos.getJSONObject(i).optString("id").equals(id))target=videos.getJSONObject(i);if(target==null||target.optJSONObject("result")==null){message("请等待分析完成");return;}JSONArray detected=target.getJSONObject("result").getJSONArray("players");String[] labels=new String[detected.length()];for(int i=0;i<labels.length;i++)labels[i]="检测球员 "+(i+1)+" · "+Math.round(detected.getJSONObject(i).optDouble("first"))+" 秒出现";new AlertDialog.Builder(this).setTitle("选择需要关联的检测球员").setItems(labels,(d,n)->linkIdentity(id,detected.optJSONObject(n))).show();});}
    private void linkIdentity(String video,JSONObject detected){LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);ImageView img=new ImageView(this);box.addView(img,new LinearLayout.LayoutParams(-1,dp(180)));String path=detected.optString("photo");if(path.startsWith("/api/"))images.execute(()->{try{byte[] b=api.request("GET",path,null,null,null);Bitmap bitmap=BitmapFactory.decodeByteArray(b,0,b.length);handler.post(()->img.setImageBitmap(bitmap));}catch(Exception ignored){}});JSONArray members=detail.optJSONArray("members");String[] labels=new String[members.length()];for(int i=0;i<labels.length;i++)labels[i]=members.optJSONObject(i).optString("name");new AlertDialog.Builder(this).setTitle("这位球员是谁？").setView(box).setItems(labels,(d,n)->run("正在关联球员",()->api.json("PATCH","/api/workbench",Api.object("type","link","videoId",video,"localId",detected.getString("id"),"target",members.getJSONObject(n).getString("personId"))),r->openRecord(activeRecord))).show();}
    private void settings(){new AlertDialog.Builder(this).setTitle("球场时刻").setMessage("每一球，都是你的时刻。\n\n版本 0.2.0 · 内测版\n\n录像上传后在服务器分析，上传期间请保持前台。照片和记录保存在你的账号下。自动统计仍为实验功能，请核对进球和球员归属。").setPositiveButton("完成",null).setNeutralButton("连接诊断",(d,w)->connectionSettings()).show();}
    private void connectionSettings(){EditText endpoint=field("HTTPS 服务地址",api.origin,false);new AlertDialog.Builder(this).setTitle("球场时刻 · 服务设置").setMessage("视频会上传到独立服务进行分析。上传时保持前台。当前为内测版 0.2.0，统计结果仍需核对。").setView(endpoint).setPositiveButton("保存并连接",(d,w)->{String value=endpoint.getText().toString().trim().replaceAll("/+$","");if(!value.matches("https://[a-zA-Z0-9.-]+(:[0-9]+)?")){message("请输入完整 HTTPS 服务地址");return;}if(busy)return;handler.removeCallbacks(poll);api.clearSession();getPreferences(MODE_PRIVATE).edit().putString("server",value).apply();api=new Api(this,value);user=null;profile=null;people=new JSONArray();history=new JSONArray();activeRecord="";pendingVideo="";authenticateSession();}).setNegativeButton("取消",null).show();}
    private void back(){if(busy){message("正在处理，请完成后再返回");return;}if("home".equals(screen)||"login".equals(screen))finish();else{activeRecord="";show("home");}}
    @Override public void onBackPressed(){back();}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);network.shutdown();images.shutdown();super.onDestroy();}
}
