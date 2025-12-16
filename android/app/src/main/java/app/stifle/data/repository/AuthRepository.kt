package app.stifle.data.repository

import app.stifle.data.local.TokenManager
import app.stifle.network.AuthApi
import app.stifle.network.AuthResponse
import app.stifle.network.LoginRequest
import app.stifle.network.RegisterRequest
import java.util.TimeZone

/**
 * Result wrapper for repository operations
 */
sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val code: Int? = null) : Result<Nothing>()
}

/**
 * Repository for authentication operations
 */
class AuthRepository(
    private val authApi: AuthApi,
    private val tokenManager: TokenManager
) {
    
    suspend fun register(
        username: String,
        email: String,
        password: String,
        inviteCode: String
    ): Result<AuthResponse> {
        return try {
            val deviceId = tokenManager.getDeviceId()
            val timezone = TimeZone.getDefault().id
            
            val response = authApi.register(
                RegisterRequest(
                    username = username,
                    email = email,
                    password = password,
                    inviteCode = inviteCode,
                    timezone = timezone,
                    deviceId = deviceId
                )
            )
            
            if (response.isSuccessful) {
                val body = response.body()!!
                tokenManager.saveTokens(body.accessToken, body.refreshToken)
                tokenManager.saveUserId(body.user.id)
                Result.Success(body)
            } else {
                Result.Error(
                    message = response.errorBody()?.string() ?: "Registration failed",
                    code = response.code()
                )
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun login(email: String, password: String): Result<AuthResponse> {
        return try {
            val deviceId = tokenManager.getDeviceId()
            
            val response = authApi.login(
                LoginRequest(
                    email = email,
                    password = password,
                    deviceId = deviceId
                )
            )
            
            if (response.isSuccessful) {
                val body = response.body()!!
                tokenManager.saveTokens(body.accessToken, body.refreshToken)
                tokenManager.saveUserId(body.user.id)
                Result.Success(body)
            } else {
                Result.Error(
                    message = response.errorBody()?.string() ?: "Login failed",
                    code = response.code()
                )
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun refreshTokens(): Result<Unit> {
        val refreshToken = tokenManager.getRefreshToken()
            ?: return Result.Error("No refresh token")
        
        return try {
            val response = authApi.refresh(
                app.stifle.network.RefreshRequest(refreshToken)
            )
            
            if (response.isSuccessful) {
                val body = response.body()!!
                tokenManager.saveTokens(body.accessToken, body.refreshToken)
                Result.Success(Unit)
            } else {
                // Refresh failed - clear tokens and force re-login
                tokenManager.clearTokens()
                Result.Error("Session expired", response.code())
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun logout() {
        try {
            authApi.logout()
        } catch (_: Exception) {
            // Ignore errors - clear local state anyway
        }
        tokenManager.clearTokens()
    }
    
    fun isLoggedIn() = tokenManager.isLoggedInFlow()
}
