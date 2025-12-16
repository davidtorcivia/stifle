package app.stifle.data.local

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

/**
 * Local event entity for Room database
 */
@Entity(tableName = "events")
data class EventEntity(
    @PrimaryKey
    val id: String,
    
    @ColumnInfo(name = "event_type")
    val eventType: String, // "lock" or "unlock"
    
    @ColumnInfo(name = "timestamp")
    val timestamp: Long,
    
    @ColumnInfo(name = "source")
    val source: String,
    
    @ColumnInfo(name = "synced")
    val synced: Boolean = false,
    
    @ColumnInfo(name = "server_id")
    val serverId: String? = null,
    
    @ColumnInfo(name = "created_at")
    val createdAt: Long = System.currentTimeMillis()
)

/**
 * Data Access Object for events
 */
@Dao
interface EventDao {
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: EventEntity)
    
    @Query("SELECT * FROM events WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<EventEntity>
    
    @Query("SELECT COUNT(*) FROM events WHERE synced = 0")
    suspend fun getUnsyncedCount(): Int
    
    @Query("UPDATE events SET synced = 1, server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)
    
    @Query("SELECT * FROM events WHERE event_type = 'lock' ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastLock(): EventEntity?
    
    @Query("SELECT * FROM events WHERE event_type = 'unlock' ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastUnlock(): EventEntity?
    
    @Query("SELECT * FROM events ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastEvent(): EventEntity?
    
    @Query("SELECT * FROM events ORDER BY timestamp DESC LIMIT 1")
    fun observeLastEvent(): Flow<EventEntity?>
    
    @Query("SELECT * FROM events WHERE timestamp >= :start AND timestamp < :end ORDER BY timestamp ASC")
    suspend fun getEventsInRange(start: Long, end: Long): List<EventEntity>
    
    @Query("DELETE FROM events WHERE timestamp < :beforeTimestamp")
    suspend fun deleteOldEvents(beforeTimestamp: Long)
}
