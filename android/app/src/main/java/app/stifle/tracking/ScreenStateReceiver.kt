package app.stifle.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import app.stifle.StifleApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Receives screen lock/unlock events from the system.
 * 
 * To ensure 100% accuracy and prevent duplicates, we now check the 
 * actual database state before recording any new event.
 * 
 * Logic:
 * - USER_PRESENT: Record UNLOCK only if last event != UNLOCK
 * - SCREEN_OFF: Record LOCK only if last event != LOCK
 * 
 * This treats the database as the single source of truth and handles
 * "glance" scenarios (where screen wakes but doesn't unlock) naturally
 * because the DB state remains "locked" throughout.
 */
class ScreenStateReceiver : BroadcastReceiver() {
    
    companion object {
        // Static map to track last processed timestamp for each action
        // This prevents race conditions when both Manifest receiver and 
        // AccessibilityService receiver fire for the same event.
        private val lastProcessed = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val DEBOUNCE_MS = 500L // 500ms debounce to prevent duplicates
    }
    
    // Use SupervisorJob so one failure doesn't cancel other operations
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    
    override fun onReceive(context: Context, intent: Intent) {
        val app = context.applicationContext as? StifleApp ?: run {
            Log.e("ScreenStateReceiver", "Could not get StifleApp context")
            return
        }
        val eventRepository = app.container.eventRepository
        
        val action = intent.action ?: return
        
        // Debounce: Check if we just processed this exact action
        val now = System.currentTimeMillis()
        val lastTime = lastProcessed[action] ?: 0L
        if (now - lastTime < DEBOUNCE_MS) {
            Log.d("ScreenStateReceiver", "Debouncing duplicate action: $action (diff: ${now - lastTime}ms)")
            // For SCREEN_ON we still want to log, but return for logic-heavy events
            if (action != Intent.ACTION_SCREEN_ON) return
        }
        lastProcessed[action] = now
        
        Log.d("ScreenStateReceiver", "Processing action: $action")
        
        when (action) {
            Intent.ACTION_USER_PRESENT -> {
                // User unlocked the device
                scope.launch {
                    try {
                        val lastEvent = eventRepository.getLastEvent()
                        // Only record if we aren't already unlocked
                        if (lastEvent?.eventType != "unlock") {
                            Log.d("ScreenStateReceiver", "Recording UNLOCK (prev: ${lastEvent?.eventType})")
                            eventRepository.recordUnlock("automatic")
                            SyncWorker.enqueue(context)
                        } else {
                            Log.d("ScreenStateReceiver", "Skipping USER_PRESENT - already unlocked")
                        }
                    } catch (e: Exception) {
                        Log.e("ScreenStateReceiver", "Failed to process USER_PRESENT", e)
                    }
                }
            }
            
            Intent.ACTION_SCREEN_ON -> {
                // Just for logging/debugging
                Log.d("ScreenStateReceiver", "SCREEN_ON detected")
            }
            
            Intent.ACTION_SCREEN_OFF -> {
                // Screen turned off
                scope.launch {
                    try {
                        val lastEvent = eventRepository.getLastEvent()
                        // Only record if we aren't already locked
                        // This handles the "Glance" case: if last event was LOCK, and we glance (wake/sleep),
                        // this check returns false and we skip the duplicate LOCK.
                        if (lastEvent == null || lastEvent.eventType != "lock") {
                            Log.d("ScreenStateReceiver", "Recording LOCK (prev: ${lastEvent?.eventType})")
                            eventRepository.recordLock("automatic")
                            SyncWorker.enqueue(context)
                        } else {
                            Log.d("ScreenStateReceiver", "Skipping SCREEN_OFF - already locked")
                        }
                    } catch (e: Exception) {
                        Log.e("ScreenStateReceiver", "Failed to process SCREEN_OFF", e)
                    }
                }
            }
        }
    }
}


