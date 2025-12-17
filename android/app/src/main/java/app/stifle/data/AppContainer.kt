package app.stifle.data

import android.content.Context
import app.stifle.data.local.AppDatabase
import app.stifle.data.local.TokenManager
import app.stifle.data.repository.AuthRepository
import app.stifle.data.repository.EventRepository
import app.stifle.data.repository.FriendsRepository
import app.stifle.data.repository.GroupRepository
import app.stifle.network.ApiClient
import app.stifle.network.FriendsApi
import app.stifle.network.UsersApi

/**
 * Dependency injection container interface
 */
interface AppContainer {
    val tokenManager: TokenManager
    val authRepository: AuthRepository
    val eventRepository: EventRepository
    val groupRepository: GroupRepository
    val friendsRepository: FriendsRepository
    val usersApi: UsersApi
    val friendsApi: FriendsApi
}

/**
 * Implementation of the DI container
 * Uses lazy initialization for efficiency
 */
class AppContainerImpl(private val context: Context) : AppContainer {
    
    private val database: AppDatabase by lazy {
        AppDatabase.getDatabase(context)
    }
    
    override val tokenManager: TokenManager by lazy {
        TokenManager(context)
    }
    
    private val apiClient: ApiClient by lazy {
        ApiClient(tokenManager)
    }
    
    override val authRepository: AuthRepository by lazy {
        AuthRepository(apiClient.authApi, tokenManager)
    }
    
    override val eventRepository: EventRepository by lazy {
        EventRepository(
            eventDao = database.eventDao(),
            eventsApi = apiClient.eventsApi,
            tokenManager = tokenManager
        )
    }
    
    override val groupRepository: GroupRepository by lazy {
        GroupRepository(apiClient.groupsApi)
    }
    
    override val friendsRepository: FriendsRepository by lazy {
        FriendsRepository(apiClient.friendsApi)
    }
    
    override val usersApi: UsersApi by lazy {
        apiClient.usersApi
    }
    
    override val friendsApi: FriendsApi by lazy {
        apiClient.friendsApi
    }
}
