package com.analyticspro.app

import android.content.Context
import android.util.Base64
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONObject

class TokenManager(context: Context) {

    private val prefs = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            "analytics_secure_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (e: Exception) {
        // Fallback to regular prefs if encryption fails
        context.getSharedPreferences("analytics_prefs", Context.MODE_PRIVATE)
    }

    companion object {
        private const val KEY_JWT = "jwt_token"
        private const val KEY_EMAIL = "user_email"
        private const val KEY_LICENSE = "license_key"
    }

    fun saveToken(token: String, email: String, licenseKey: String = "") {
        prefs.edit()
            .putString(KEY_JWT, token)
            .putString(KEY_EMAIL, email)
            .putString(KEY_LICENSE, licenseKey)
            .apply()
    }

    fun getToken(): String? = prefs.getString(KEY_JWT, null)
    fun getEmail(): String? = prefs.getString(KEY_EMAIL, null)

    fun hasValidToken(): Boolean {
        val token = getToken() ?: return false
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return false
            val payload = String(Base64.decode(parts[1], Base64.URL_SAFE or Base64.NO_PADDING))
            val json = JSONObject(payload)
            val exp = json.optLong("exp", 0L)
            exp > 0 && exp * 1000 > System.currentTimeMillis()
        } catch (e: Exception) {
            false
        }
    }

    fun clearToken() {
        prefs.edit()
            .remove(KEY_JWT)
            .remove(KEY_EMAIL)
            .remove(KEY_LICENSE)
            .apply()
    }
}
