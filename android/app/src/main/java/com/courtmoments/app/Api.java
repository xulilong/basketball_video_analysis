package com.courtmoments.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

/** Native HTTPS client. Session is encrypted with a device-bound Android Keystore key. */
final class Api {
    final String origin;
    private volatile String cookie = "";
    private final SharedPreferences prefs;
    Api(Context context, String origin) {
        this.origin = origin;
        prefs = context.getSharedPreferences("session", Context.MODE_PRIVATE);
        if (origin.equals(prefs.getString("origin", ""))) {
            try { cookie = decrypt(prefs.getString("value", "")); } catch (Exception ignored) { clearSession(); }
        }
    }
    String cookie() { return cookie; }
    void clearSession() { cookie = ""; prefs.edit().clear().apply(); }
    static JSONObject object(Object... pairs) throws JSONException {
        JSONObject o = new JSONObject(); for (int n=0;n<pairs.length;n+=2) o.put((String)pairs[n],pairs[n+1]); return o;
    }
    Object json(String method, String path, JSONObject body) throws Exception {
        byte[] raw = body == null ? null : body.toString().getBytes(StandardCharsets.UTF_8);
        String value = new String(request(method,path,raw,"application/json",null),StandardCharsets.UTF_8);
        return new JSONTokener(value).nextValue();
    }
    JSONObject get(String path) throws Exception { return (JSONObject)json("GET",path,null); }
    JSONObject post(String path, JSONObject data) throws Exception { return (JSONObject)json("POST",path,data); }
    byte[] request(String method, String path, byte[] body, String type, String hash) throws Exception {
        if (!path.startsWith("/") || path.startsWith("//")) throw new IOException("无效地址");
        HttpURLConnection c=(HttpURLConnection)new URL(origin+path).openConnection();
        c.setInstanceFollowRedirects(false); c.setConnectTimeout(15000); c.setReadTimeout(body == null ? 20000 : 90000);
        c.setRequestMethod(method); c.setRequestProperty("Accept","application/json");
        c.setRequestProperty("Origin",origin); c.setRequestProperty("User-Agent","CourtMoments/0.2 Android");
        if(!cookie.isEmpty()) c.setRequestProperty("Cookie",cookie);
        if(hash!=null) c.setRequestProperty("X-Chunk-Sha256",hash);
        try {
            if(body!=null) { c.setDoOutput(true); c.setRequestProperty("Content-Type",type); c.setFixedLengthStreamingMode(body.length); try(OutputStream out=c.getOutputStream()){out.write(body);} }
            int code=c.getResponseCode();
            String session=c.getHeaderField("Set-Cookie");
            if(session!=null && session.startsWith("mt_session=")) {
                cookie=session.split(";",2)[0];
                prefs.edit().putString("origin",origin).putString("value",encrypt(cookie)).apply();
            }
            InputStream input=code>=400?c.getErrorStream():c.getInputStream();
            byte[] bytes=input==null?new byte[0]:read(input,12*1024*1024);
            if(code<200 || code>=300) {
                if(code==401) throw new IOException("登录已过期，请退出后重新登录");
                String message="服务暂时不可用（"+code+"）";
                try { message=new JSONObject(new String(bytes,StandardCharsets.UTF_8)).optString("error",message); } catch(JSONException ignored){}
                throw new IOException(message);
            }
            return bytes;
        } catch(UnknownHostException e) { throw new IOException("暂时无法连接服务地址，请检查网络后重试"); } catch(ConnectException e) { throw new IOException("无法连接服务器，请稍后重试"); } catch(SocketTimeoutException e) { throw new IOException("连接超时，请检查网络后重试"); }
        finally { c.disconnect(); }
    }
    static byte[] read(InputStream in,int limit) throws IOException {
        try(InputStream source=in;ByteArrayOutputStream out=new ByteArrayOutputStream()) {
            byte[] b=new byte[16384];int n;while((n=source.read(b))!=-1){if(out.size()+n>limit) throw new IOException("文件太大");out.write(b,0,n);}return out.toByteArray();
        }
    }
    private javax.crypto.SecretKey key() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias("court-session")) {
            KeyGenerator gen=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("court-session",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());gen.generateKey();
        }
        return (javax.crypto.SecretKey)store.getKey("court-session",null);
    }
    private String encrypt(String value) throws Exception {
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());
        return Base64.encodeToString(c.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
    }
    private String decrypt(String value) throws Exception {
        if(value.isEmpty()) return "";String[] parts=value.split(":",2);
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
        return new String(c.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8);
    }
}
