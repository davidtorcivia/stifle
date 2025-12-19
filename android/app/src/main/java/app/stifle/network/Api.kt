package app.stifle.network

import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT

// === Auth API ===

data class RegisterRequest(
    val username: String,
    val email: String,
    val password: String,
    val inviteCode: String,
    val platform: String = "android",
    val timezone: String,
    val deviceId: String
)

data class LoginRequest(
    val email: String,
    val password: String,
    val deviceId: String
)

data class RefreshRequest(
    val refreshToken: String
)

data class AuthResponse(
    val user: UserInfo,
    val accessToken: String,
    val refreshToken: String
)

data class TokenResponse(
    val accessToken: String,
    val refreshToken: String
)

data class UserInfo(
    val id: String,
    val username: String,
    val email: String,
    val timezone: String,
    val platform: String,
    val trackingStatus: String,
    val isDiscoverable: Boolean = true // Added field
)

interface AuthApi {
    @POST("auth/register")
    suspend fun register(@Body request: RegisterRequest): Response<AuthResponse>
    
    @POST("auth/login")
    suspend fun login(@Body request: LoginRequest): Response<AuthResponse>
    
    @POST("auth/refresh")
    suspend fun refresh(@Body request: RefreshRequest): Response<TokenResponse>
    
    @POST("auth/logout")
    suspend fun logout(): Response<Unit>
}

// === Events API ===

data class EventPayload(
    val id: String,
    val eventType: String,
    val timestamp: Long,
    val source: String
)

data class SyncRequest(
    val events: List<EventPayload>,
    val lastSync: Long,
    val clientTime: Long
)

data class SyncResponse(
    val confirmed: List<ConfirmedEvent>,
    val newEvents: List<EventPayload>,
    val serverTime: Long
)

data class ConfirmedEvent(
    val clientId: String,
    val serverId: String
)

data class CurrentStreakResponse(
    val inStreak: Boolean,
    val streakStartedAt: Long?,
    val currentStreakSeconds: Int
)

interface EventsApi {
    @POST("events/sync")
    suspend fun sync(@Body request: SyncRequest): Response<SyncResponse>
    
    @GET("events/current")
    suspend fun getCurrentStreak(): Response<CurrentStreakResponse>
}

// === Users API ===

data class UserProfile(
    val id: String,
    val username: String,
    val email: String,
    val timezone: String,
    val platform: String,
    val trackingStatus: String,
    val createdAt: String,
    val weeklyScore: WeeklyScore,
    val isDiscoverable: Boolean = true,
    val ghostMode: Boolean = false
)

data class WeeklyScore(
    val totalPoints: Double,
    val streakCount: Int,
    val longestStreak: Int
)

data class UpdateTrackingRequest(
    val status: String
)

data class UpdateProfileRequest(
    val username: String? = null,
    val timezone: String? = null,
    val isDiscoverable: Boolean? = null,
    val ghostMode: Boolean? = null
)

data class InviteCode(
    val code: String,
    val used: Boolean,
    val expiresAt: String,
    val createdAt: String
)

data class CreateInviteResponse(
    val code: String,
    val expiresIn: String
)

data class PushTokenRequest(
    val token: String,
    val platform: String = "android"
)

data class TemptationSettings(
    val enabled: Boolean,
    val frequencyMinutes: Int,
    val quietHoursStart: String,
    val quietHoursEnd: String
)

data class UpdateTemptationRequest(
    val enabled: Boolean? = null,
    val frequencyMinutes: Int? = null,
    val quietHoursStart: String? = null,
    val quietHoursEnd: String? = null
)

// Stats for HomeScreen
data class UserStats(
    val weeklyPoints: Double,
    val todayStreakCount: Int,
    val lastStreak: LastStreak?
)

data class LastStreak(
    val durationSeconds: Int,
    val pointsEarned: Double,
    val endedAt: String
)

// Weekly Summary for ghost comparisons and turnovers
data class WeeklySummary(
    val thisWeek: ThisWeekStats,
    val vsLastWeek: VsLastWeek? = null,
    val vsFriendsAvg: VsFriendsAvg? = null,
    val vsPersonalBest: VsPersonalBest? = null,
    val vsPersonalAvg: VsPersonalAvg? = null,
    val trend: TrendInfo? = null
)

data class ThisWeekStats(
    val points: Double,
    val streaks: Int,
    val rank: Int,
    val totalParticipants: Int
)

data class VsLastWeek(
    val pointsDiff: Double,
    val percentDiff: Double,
    val wasImprovement: Boolean
)

data class VsFriendsAvg(
    val percentDiff: Double,
    val isAboveAvg: Boolean
)

data class VsPersonalBest(
    val bestPoints: Double,
    val bestWeek: String?,
    val isBeat: Boolean,
    val pointsAway: Double
)

data class VsPersonalAvg(
    val avgPoints: Double,
    val percentDiff: Double
)

data class TrendInfo(
    val weeksImproving: Int
)

interface UsersApi {
    @GET("users/me")
    suspend fun getMe(): Response<UserProfile>
    
    @GET("users/me/stats")
    suspend fun getStats(): Response<UserStats>
    
    @GET("users/me/weekly-summary")
    suspend fun getWeeklySummary(): Response<WeeklySummary>
    
    @PUT("users/me")
    suspend fun updateProfile(@Body request: UpdateProfileRequest): Response<Unit>
    
    @retrofit2.http.DELETE("users/me")
    suspend fun deleteAccount(): Response<Unit>
    
    @PUT("users/me/tracking-status")
    suspend fun updateTrackingStatus(@Body request: UpdateTrackingRequest): Response<Unit>
    
    @POST("users/me/invites")
    suspend fun createInvite(): Response<CreateInviteResponse>
    
    @GET("users/me/invites")
    suspend fun getInvites(): Response<List<InviteCode>>
    
    @POST("users/me/push-token")
    suspend fun registerPushToken(@Body request: Map<String, String>): Response<Unit>
    
    @GET("users/me/temptation")
    suspend fun getTemptationSettings(): Response<TemptationSettings>
    
    @PUT("users/me/temptation")
    suspend fun updateTemptationSettings(@Body request: UpdateTemptationRequest): Response<Unit>
    
    @PUT("users/me/password")
    suspend fun changePassword(@Body request: Map<String, String>): Response<Unit>
    
    @PUT("users/me/email")
    suspend fun changeEmail(@Body request: Map<String, String>): Response<Unit>
    
    @GET("users/me/export")
    suspend fun exportData(): Response<Map<String, Any>>
}

// === Groups API ===

data class CreateGroupRequest(
    val name: String,
    val description: String? = null,
    val isPrivate: Boolean = true
)

data class Group(
    val id: String,
    val name: String,
    val description: String?,
    val isPrivate: Boolean,
    val inviteCode: String?,
    val createdAt: String,
    val role: String?,
    val memberCount: Int?
)

data class JoinGroupRequest(
    val code: String
)

data class JoinGroupResponse(
    val success: Boolean,
    val groupId: String,
    val groupName: String
)

data class LeaderboardEntry(
    val rank: Int,
    val userId: String,
    val username: String,
    val trackingStatus: String,
    val totalPoints: Double,
    val streakCount: Int,
    val longestStreak: Int,
    val isYou: Boolean
)

data class GroupLeaderboardResponse(
    val leaderboard: List<LeaderboardEntry>,
    val lastUpdated: String,
    val nextUpdateAt: String
)

interface GroupsApi {
    @POST("groups")
    suspend fun createGroup(@Body request: CreateGroupRequest): Response<Group>
    
    @GET("groups")
    suspend fun getGroups(): Response<List<Group>>
    
    @POST("groups/join")
    suspend fun joinGroup(@Body request: JoinGroupRequest): Response<JoinGroupResponse>
    
    @retrofit2.http.GET("groups/{id}/leaderboard")
    suspend fun getLeaderboard(@retrofit2.http.Path("id") groupId: String): Response<GroupLeaderboardResponse>
}

// === Friends API ===

data class FriendSearchResult(
    val id: String,
    val username: String,
    val platform: String,
    val friendshipStatus: String?,
    val requestDirection: String?
)

data class FriendSearchResponse(
    val users: List<FriendSearchResult>
)

data class Friend(
    val id: String,
    val username: String,
    val platform: String,
    val friendsSince: String
)

data class FriendsListResponse(
    val friends: List<Friend>
)

data class FriendRequest(
    val id: String,
    val userId: String,
    val username: String,
    val platform: String,
    val createdAt: String
)

data class FriendRequestsResponse(
    val requests: List<FriendRequest>
)

data class FriendLeaderboardEntry(
    val rank: Int,
    val id: String,
    val username: String,
    val platform: String,
    val points: Double,
    val streakCount: Int,
    val longestStreak: Int,
    val isCurrentUser: Boolean
)

data class FriendsLeaderboardResponse(
    val leaderboard: List<FriendLeaderboardEntry>,
    val currentUserRank: Int,
    val totalFriends: Int
)

data class SendFriendRequestBody(
    val userId: String
)

data class BlockUserRequest(
    val userId: String
)

data class BlockedUser(
    val id: String,
    val username: String
)

data class BlockedUsersResponse(
    val blocked: List<BlockedUser>
)

data class RespondRequestBody(
    val action: String  // "accept" or "decline"
)

data class FriendRequestResponse(
    val message: String,
    val status: String
)

interface FriendsApi {
    @GET("friends/search")
    suspend fun searchUsers(@retrofit2.http.Query("query") query: String): Response<FriendSearchResponse>
    
    @GET("friends")
    suspend fun getFriends(): Response<FriendsListResponse>
    
    @GET("friends/leaderboard")
    suspend fun getLeaderboard(): Response<FriendsLeaderboardResponse>
    
    @POST("friends/request")
    suspend fun sendRequest(@Body request: SendFriendRequestBody): Response<FriendRequestResponse>
    
    @GET("friends/requests")
    suspend fun getIncomingRequests(): Response<FriendRequestsResponse>
    
    @GET("friends/requests/sent")
    suspend fun getSentRequests(): Response<FriendRequestsResponse>
    
    @POST("friends/requests/{id}/respond")
    suspend fun respondToRequest(
        @retrofit2.http.Path("id") requestId: String,
        @Body response: RespondRequestBody
    ): Response<FriendRequestResponse>
    
    @retrofit2.http.DELETE("friends/requests/{id}")
    suspend fun cancelRequest(@retrofit2.http.Path("id") requestId: String): Response<Unit>
    
    @retrofit2.http.DELETE("friends/{id}")
    suspend fun removeFriend(@retrofit2.http.Path("id") friendId: String): Response<Unit>

    @POST("friends/block")
    suspend fun blockUser(@Body request: BlockUserRequest): Response<Unit>

    @retrofit2.http.DELETE("friends/block/{id}")
    suspend fun unblockUser(@retrofit2.http.Path("id") userId: String): Response<Unit>

    @GET("friends/blocked")
    suspend fun getBlockedUsers(): Response<BlockedUsersResponse>
}
