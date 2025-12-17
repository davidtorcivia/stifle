package app.stifle.data.repository

import app.stifle.network.CreateGroupRequest
import app.stifle.network.Group
import app.stifle.network.GroupsApi
import app.stifle.network.JoinGroupRequest
import app.stifle.network.LeaderboardEntry

/**
 * Repository for group operations
 */
class GroupRepository(
    private val groupsApi: GroupsApi
) {
    
    suspend fun createGroup(
        name: String,
        description: String? = null,
        isPrivate: Boolean = true
    ): Result<Group> {
        return try {
            android.util.Log.d("GroupRepository", "Creating group: $name")
            val response = groupsApi.createGroup(
                CreateGroupRequest(
                    name = name,
                    description = description,
                    isPrivate = isPrivate
                )
            )
            
            if (response.isSuccessful) {
                android.util.Log.d("GroupRepository", "Group created successfully: ${response.body()}")
                Result.Success(response.body()!!)
            } else {
                val errorBody = response.errorBody()?.string() ?: "Unknown error"
                android.util.Log.e("GroupRepository", "Failed to create group: ${response.code()} - $errorBody")
                Result.Error("Failed to create group: $errorBody", response.code())
            }
        } catch (e: Exception) {
            android.util.Log.e("GroupRepository", "Exception creating group", e)
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun getGroups(): Result<List<Group>> {
        return try {
            val response = groupsApi.getGroups()
            
            if (response.isSuccessful) {
                Result.Success(response.body()!!)
            } else {
                Result.Error("Failed to fetch groups", response.code())
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun joinGroup(code: String): Result<String> {
        return try {
            val response = groupsApi.joinGroup(JoinGroupRequest(code))
            
            if (response.isSuccessful) {
                val body = response.body()!!
                Result.Success(body.groupName)
            } else {
                Result.Error("Failed to join group", response.code())
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Network error")
        }
    }
    
    suspend fun getLeaderboard(groupId: String): Result<List<LeaderboardEntry>> {
        return try {
            android.util.Log.d("GroupRepository", "Fetching leaderboard for group: $groupId")
            val response = groupsApi.getLeaderboard(groupId)
            
            android.util.Log.d("GroupRepository", "Response code: ${response.code()}")
            if (response.isSuccessful) {
                val body = response.body()
                android.util.Log.d("GroupRepository", "Response body: $body")
                android.util.Log.d("GroupRepository", "Leaderboard entries: ${body?.leaderboard?.size ?: 0}")
                Result.Success(body?.leaderboard ?: emptyList())
            } else {
                val errorBody = response.errorBody()?.string()
                android.util.Log.e("GroupRepository", "Error: ${response.code()} - $errorBody")
                Result.Error("Failed to fetch leaderboard: $errorBody", response.code())
            }
        } catch (e: Exception) {
            android.util.Log.e("GroupRepository", "Exception fetching leaderboard", e)
            Result.Error(e.message ?: "Network error")
        }
    }
}
