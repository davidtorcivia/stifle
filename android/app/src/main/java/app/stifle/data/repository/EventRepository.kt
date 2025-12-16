package app.stifle.data.repository

import app.stifle.data.local.EventDao
import app.stifle.data.local.EventEntity
import app.stifle.data.local.TokenManager
import app.stifle.network.EventPayload
import app.stifle.network.EventsApi
import app.stifle.network.SyncRequest
import kotlinx.coroutines.flow.Flow
import java.util.UUID

/**
 * Repository for event tracking and sync
 * Implements offline-first pattern with local storage
 */
class EventRepository(
    private val eventDao: EventDao,
    private val eventsApi: EventsApi,
    private val tokenManager: TokenManager
) {
    
    /**
     * Record a lock event (phone locked)
     */
    suspend fun recordLock(source: String = "automatic") {
        val event = EventEntity(
            id = UUID.randomUUID().toString(),
            eventType = "lock",
            timestamp = System.currentTimeMillis(),
            source = source,
            synced = false
        )
        eventDao.insert(event)
    }
    
    /**
     * Record an unlock event (phone unlocked)
     */
    suspend fun recordUnlock(source: String = "automatic") {
        val event = EventEntity(
            id = UUID.randomUUID().toString(),
            eventType = "unlock",
            timestamp = System.currentTimeMillis(),
            source = source,
            synced = false
        )
        eventDao.insert(event)
    }
    
    /**
     * Get the last event (for streak calculation)
     */
    suspend fun getLastEvent(): EventEntity? = eventDao.getLastEvent()
    
    /**
     * Observe the last event as a Flow
     */
    fun observeLastEvent(): Flow<EventEntity?> = eventDao.observeLastEvent()
    
    /**
     * Check if currently in a streak (last event was a lock)
     */
    suspend fun isInStreak(): Boolean {
        val lastEvent = eventDao.getLastEvent()
        return lastEvent?.eventType == "lock"
    }
    
    /**
     * Get current streak duration in seconds (0 if not in streak)
     */
    suspend fun getCurrentStreakSeconds(): Int {
        val lastEvent = eventDao.getLastEvent() ?: return 0
        if (lastEvent.eventType != "lock") return 0
        
        return ((System.currentTimeMillis() - lastEvent.timestamp) / 1000).toInt()
    }
    
    /**
     * Sync unsynced events with server
     * Returns number of events synced, or -1 on error
     */
    suspend fun syncEvents(): Result<Int> {
        val unsyncedEvents = eventDao.getUnsynced()
        if (unsyncedEvents.isEmpty()) {
            return Result.Success(0)
        }
        
        return try {
            val response = eventsApi.sync(
                SyncRequest(
                    events = unsyncedEvents.map { event ->
                        EventPayload(
                            id = event.id,
                            eventType = event.eventType,
                            timestamp = event.timestamp,
                            source = event.source
                        )
                    },
                    lastSync = getLastSyncTime(),
                    clientTime = System.currentTimeMillis()
                )
            )
            
            if (response.isSuccessful) {
                val body = response.body()!!
                
                // Mark confirmed events as synced
                body.confirmed.forEach { confirmed ->
                    eventDao.markSynced(confirmed.clientId, confirmed.serverId)
                }
                
                // Store new events from server (for multi-device, though we limit to one)
                body.newEvents.forEach { serverEvent ->
                    eventDao.insert(
                        EventEntity(
                            id = serverEvent.id,
                            eventType = serverEvent.eventType,
                            timestamp = serverEvent.timestamp,
                            source = serverEvent.source,
                            synced = true,
                            serverId = serverEvent.id
                        )
                    )
                }
                
                saveLastSyncTime(body.serverTime)
                Result.Success(body.confirmed.size)
            } else {
                Result.Error("Sync failed: ${response.code()}")
            }
        } catch (e: Exception) {
            Result.Error(e.message ?: "Sync error")
        }
    }
    
    /**
     * Get count of unsynced events
     */
    suspend fun getUnsyncedCount(): Int = eventDao.getUnsyncedCount()
    
    /**
     * Clean up old events (keep last 90 days)
     */
    suspend fun cleanupOldEvents() {
        val cutoff = System.currentTimeMillis() - (90L * 24 * 60 * 60 * 1000)
        eventDao.deleteOldEvents(cutoff)
    }
    
    // Simple in-memory cache for last sync time
    // In production, persist this to DataStore
    private var lastSyncTime: Long = 0L
    
    private fun getLastSyncTime(): Long = lastSyncTime
    
    private fun saveLastSyncTime(time: Long) {
        lastSyncTime = time
    }
}
