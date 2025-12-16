package app.stifle.data.local

import android.content.Context
import android.util.Base64
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "auth_prefs")

/**
 * Secure token manager using encrypted DataStore
 * Stores JWT access and refresh tokens with AES-GCM encryption
 */
class TokenManager(private val context: Context) {
    
    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val USER_ID = stringPreferencesKey("user_id")
        private val DEVICE_ID = stringPreferencesKey("device_id")
        private val ENCRYPTION_KEY = stringPreferencesKey("enc_key")
        
        private const val AES_MODE = "AES/GCM/NoPadding"
        private const val GCM_IV_LENGTH = 12
        private const val GCM_TAG_LENGTH = 128
    }
    
    private var cachedKey: SecretKey? = null
    
    /**
     * Get or generate encryption key
     * In production, consider using Android Keystore for hardware-backed keys
     */
    private suspend fun getOrCreateKey(): SecretKey {
        cachedKey?.let { return it }
        
        val prefs = context.dataStore.data.first()
        val storedKey = prefs[ENCRYPTION_KEY]
        
        return if (storedKey != null) {
            val keyBytes = Base64.decode(storedKey, Base64.NO_WRAP)
            SecretKeySpec(keyBytes, "AES").also { cachedKey = it }
        } else {
            val keyGen = KeyGenerator.getInstance("AES")
            keyGen.init(256, SecureRandom())
            val newKey = keyGen.generateKey()
            
            context.dataStore.edit { settings ->
                settings[ENCRYPTION_KEY] = Base64.encodeToString(newKey.encoded, Base64.NO_WRAP)
            }
            
            newKey.also { cachedKey = it }
        }
    }
    
    private suspend fun encrypt(plaintext: String): String {
        val key = getOrCreateKey()
        val cipher = Cipher.getInstance(AES_MODE)
        val iv = ByteArray(GCM_IV_LENGTH).also { SecureRandom().nextBytes(it) }
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH, iv))
        
        val ciphertext = cipher.doFinal(plaintext.toByteArray(Charsets.UTF_8))
        val combined = iv + ciphertext
        
        return Base64.encodeToString(combined, Base64.NO_WRAP)
    }
    
    private suspend fun decrypt(encrypted: String): String? {
        return try {
            val key = getOrCreateKey()
            val combined = Base64.decode(encrypted, Base64.NO_WRAP)
            val iv = combined.sliceArray(0 until GCM_IV_LENGTH)
            val ciphertext = combined.sliceArray(GCM_IV_LENGTH until combined.size)
            
            val cipher = Cipher.getInstance(AES_MODE)
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_LENGTH, iv))
            
            String(cipher.doFinal(ciphertext), Charsets.UTF_8)
        } catch (e: Exception) {
            null
        }
    }
    
    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        val encryptedAccess = encrypt(accessToken)
        val encryptedRefresh = encrypt(refreshToken)
        
        context.dataStore.edit { settings ->
            settings[ACCESS_TOKEN] = encryptedAccess
            settings[REFRESH_TOKEN] = encryptedRefresh
        }
    }
    
    suspend fun getAccessToken(): String? {
        val prefs = context.dataStore.data.first()
        val encrypted = prefs[ACCESS_TOKEN] ?: return null
        return decrypt(encrypted)
    }
    
    suspend fun getRefreshToken(): String? {
        val prefs = context.dataStore.data.first()
        val encrypted = prefs[REFRESH_TOKEN] ?: return null
        return decrypt(encrypted)
    }
    
    suspend fun saveUserId(userId: String) {
        context.dataStore.edit { settings ->
            settings[USER_ID] = userId
        }
    }
    
    suspend fun getUserId(): String? {
        return context.dataStore.data.first()[USER_ID]
    }
    
    /**
     * Get or generate a stable device ID
     */
    suspend fun getDeviceId(): String {
        val prefs = context.dataStore.data.first()
        val existing = prefs[DEVICE_ID]
        
        if (existing != null) return existing
        
        val newId = java.util.UUID.randomUUID().toString()
        context.dataStore.edit { settings ->
            settings[DEVICE_ID] = newId
        }
        return newId
    }
    
    fun isLoggedInFlow(): Flow<Boolean> {
        return context.dataStore.data.map { prefs ->
            prefs[ACCESS_TOKEN] != null
        }
    }
    
    suspend fun isLoggedIn(): Boolean {
        return context.dataStore.data.first()[ACCESS_TOKEN] != null
    }
    
    suspend fun clearTokens() {
        context.dataStore.edit { settings ->
            settings.remove(ACCESS_TOKEN)
            settings.remove(REFRESH_TOKEN)
            settings.remove(USER_ID)
            // Keep PUSH_TOKEN for re-registration after login
        }
    }
    
    // Push token management
    private val PUSH_TOKEN = stringPreferencesKey("push_token")
    
    suspend fun setPushToken(token: String) {
        context.dataStore.edit { settings ->
            settings[PUSH_TOKEN] = token
        }
    }
    
    suspend fun getPushToken(): String? {
        return context.dataStore.data.first()[PUSH_TOKEN]
    }
}
