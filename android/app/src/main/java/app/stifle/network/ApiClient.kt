package app.stifle.network

import app.stifle.BuildConfig
import app.stifle.data.local.TokenManager
import kotlinx.coroutines.runBlocking
import okhttp3.Authenticator
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit

/**
 * API client with token management and automatic refresh
 */
class ApiClient(private val tokenManager: TokenManager) {
    
    private val authInterceptor = Interceptor { chain ->
        val token = runBlocking { tokenManager.getAccessToken() }
        val request = if (token != null) {
            chain.request().newBuilder()
                .addHeader("Authorization", "Bearer $token")
                .build()
        } else {
            chain.request()
        }
        chain.proceed(request)
    }
    
    /**
     * Authenticator that handles 401 responses by refreshing the token
     */
    private val tokenAuthenticator = Authenticator { _: Route?, response: Response ->
        // Don't retry if we've already tried once or if this is a refresh request
        if (response.request.url.encodedPath.contains("auth/refresh")) {
            return@Authenticator null
        }
        
        // Check if we've already retried
        if (response.priorResponse != null) {
            return@Authenticator null
        }
        
        // Try to refresh the token
        val newToken = runBlocking {
            val refreshToken = tokenManager.getRefreshToken() ?: return@runBlocking null
            
            try {
                val refreshResponse = authApi.refresh(RefreshRequest(refreshToken))
                if (refreshResponse.isSuccessful) {
                    val body = refreshResponse.body()!!
                    tokenManager.saveTokens(body.accessToken, body.refreshToken)
                    body.accessToken
                } else {
                    // Refresh failed - clear tokens (will force re-login)
                    tokenManager.clearTokens()
                    null
                }
            } catch (e: Exception) {
                null
            }
        }
        
        if (newToken != null) {
            response.request.newBuilder()
                .header("Authorization", "Bearer $newToken")
                .build()
        } else {
            null
        }
    }
    
    private val loggingInterceptor = HttpLoggingInterceptor().apply {
        level = if (BuildConfig.DEBUG) {
            HttpLoggingInterceptor.Level.BODY
        } else {
            HttpLoggingInterceptor.Level.NONE
        }
    }
    
    private val okHttpClient = OkHttpClient.Builder()
        .addInterceptor(authInterceptor)
        .addInterceptor(loggingInterceptor)
        .authenticator(tokenAuthenticator)
        .connectTimeout(30, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()
    
    private val retrofit: Retrofit = Retrofit.Builder()
        .baseUrl(BuildConfig.API_BASE_URL + "/")
        .client(okHttpClient)
        .addConverterFactory(GsonConverterFactory.create())
        .build()
    
    val authApi: AuthApi = retrofit.create(AuthApi::class.java)
    val eventsApi: EventsApi = retrofit.create(EventsApi::class.java)
    val groupsApi: GroupsApi = retrofit.create(GroupsApi::class.java)
    val usersApi: UsersApi = retrofit.create(UsersApi::class.java)
    val friendsApi: FriendsApi = retrofit.create(FriendsApi::class.java)
}

