package com.hng3444.suur;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SuurSecureSession")
public class SuurSecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "suur_mobile_session_v1";
    private static final String STORE_NAME = "suur_secure_session";
    private static final String STORE_IV = "iv";
    private static final String STORE_VALUE = "value";
    private static final int MAX_SESSION_BYTES = 32 * 1024;

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(STORE_NAME, Context.MODE_PRIVATE);
    }

    private SecretKey getOrCreateKey() throws GeneralSecurityException, IOException {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            return ((KeyStore.SecretKeyEntry) keyStore.getEntry(KEY_ALIAS, null)).getSecretKey();
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            .build());
        return generator.generateKey();
    }

    @PluginMethod
    public void save(PluginCall call) {
        String value = call.getString("value");
        if (value == null || value.isEmpty()) {
            call.reject("A session value is required.", "SESSION_REQUIRED");
            return;
        }
        byte[] cleartext = value.getBytes(StandardCharsets.UTF_8);
        if (cleartext.length > MAX_SESSION_BYTES) {
            call.reject("The session value is too large.", "SESSION_TOO_LARGE");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
            byte[] encrypted = cipher.doFinal(cleartext);
            boolean stored = preferences().edit()
                .putString(STORE_IV, Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .putString(STORE_VALUE, Base64.encodeToString(encrypted, Base64.NO_WRAP))
                .commit();
            if (!stored) {
                call.reject("The session could not be stored.", "SESSION_STORE_FAILED");
                return;
            }
            call.resolve();
        } catch (Exception error) {
            call.reject("The session could not be encrypted.", "SESSION_ENCRYPTION_FAILED", error);
        }
    }

    @PluginMethod
    public void load(PluginCall call) {
        String ivValue = preferences().getString(STORE_IV, null);
        String encryptedValue = preferences().getString(STORE_VALUE, null);
        JSObject result = new JSObject();
        if (ivValue == null || encryptedValue == null) {
            result.put("value", JSONObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] iv = Base64.decode(ivValue, Base64.NO_WRAP);
            byte[] encrypted = Base64.decode(encryptedValue, Base64.NO_WRAP);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, iv));
            String cleartext = new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
            result.put("value", cleartext);
            call.resolve(result);
        } catch (Exception error) {
            preferences().edit().clear().commit();
            call.reject("The stored session could not be decrypted.", "SESSION_DECRYPTION_FAILED", error);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            preferences().edit().clear().commit();
            KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
            keyStore.load(null);
            if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
            call.resolve();
        } catch (Exception error) {
            call.reject("The session could not be removed.", "SESSION_CLEAR_FAILED", error);
        }
    }
}
