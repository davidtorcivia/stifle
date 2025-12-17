package app.stifle.data.repository

import app.stifle.network.FriendLeaderboardEntry
import app.stifle.network.FriendRequest
import app.stifle.network.FriendSearchResult
import app.stifle.network.FriendsApi
import app.stifle.network.RespondRequestBody
import app.stifle.network.SendFriendRequestBody

/**
 * Repository for friends operations
 */
class FriendsRepository(
    private val friendsApi: FriendsApi
) {
    
    /**
     * Search for users by username
     */
    suspend fun searchUsers(query: String): Result<List<FriendSearchResult>> {
        return try {
            val response = friendsApi.searchUsers(query)
            if (response.isSuccessful) {
                Result.Success(response.body()?.users ?: emptyList())
            } else {
                Result.Error("Search failed: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Search error")
        }
    }
    
    /**
     * Get friends leaderboard
     */
    suspend fun getLeaderboard(): Result<List<FriendLeaderboardEntry>> {
        return try {
            val response = friendsApi.getLeaderboard()
            if (response.isSuccessful) {
                Result.Success(response.body()?.leaderboard ?: emptyList())
            } else {
                Result.Error("Failed to load leaderboard: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Send a friend request
     */
    suspend fun sendFriendRequest(userId: String): Result<String> {
        return try {
            val response = friendsApi.sendRequest(SendFriendRequestBody(userId))
            if (response.isSuccessful) {
                Result.Success(response.body()?.message ?: "Request sent")
            } else {
                Result.Error("Failed to send request: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Get incoming friend requests
     */
    suspend fun getIncomingRequests(): Result<List<FriendRequest>> {
        return try {
            val response = friendsApi.getIncomingRequests()
            if (response.isSuccessful) {
                Result.Success(response.body()?.requests ?: emptyList())
            } else {
                Result.Error("Failed to load requests: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Accept or decline a friend request
     */
    suspend fun respondToRequest(requestId: String, accept: Boolean): Result<Unit> {
        return try {
            val response = friendsApi.respondToRequest(
                requestId, 
                RespondRequestBody(if (accept) "accept" else "decline")
            )
            if (response.isSuccessful) {
                Result.Success(Unit)
            } else {
                Result.Error("Failed to respond: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    /**
     * Remove a friend
     */
    suspend fun removeFriend(friendId: String): Result<Unit> {
        return try {
            val response = friendsApi.removeFriend(friendId)
            if (response.isSuccessful) {
                Result.Success(Unit)
            } else {
                Result.Error("Failed to remove friend: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }

    suspend fun blockUser(userId: String): Result<Unit> {
        return try {
            val response = friendsApi.blockUser(app.stifle.network.BlockUserRequest(userId))
            if (response.isSuccessful) {
                Result.Success(Unit)
            } else {
                Result.Error("Failed to block user: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }

    suspend fun unblockUser(userId: String): Result<Unit> {
        return try {
            val response = friendsApi.unblockUser(userId)
            if (response.isSuccessful) {
                Result.Success(Unit)
            } else {
                Result.Error("Failed to unblock user: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }

    suspend fun getBlockedUsers(): Result<List<app.stifle.network.BlockedUser>> {
        return try {
            val response = friendsApi.getBlockedUsers()
            if (response.isSuccessful) {
                Result.Success(response.body()?.blocked ?: emptyList())
            } else {
                Result.Error("Failed to load blocked users: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
}
