package app.stifle.notifications

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/**
 * Manages temptation notifications - the core feature for encouraging users
 * to put down their phones.
 * 
 * Temptation Philosophy:
 * - These are NOT annoying "put down your phone!" alerts
 * - They are gentle, warm reminders that respect the user's agency
 * - Messages are encouraging, not guilt-tripping
 * - Timing is based on user preferences (quiet hours respected)
 */
object TemptationManager {
    
    // Message templates - warm, encouraging, not preachy
    val temptationMessages = listOf(
        // Gentle observations
        "Hey. Just checking in.",
        "The world outside is still there.",
        "Take a breath. It's okay to pause.",
        
        // Encouraging
        "You're doing great. Maybe take a moment?",
        "Remember why you started.",
        "Every small step counts.",
        
        // Playful
        "Your phone isn't going anywhere.",
        "Plot twist: nothing urgent happened.",
        "This scroll can wait.",
        
        // Reflective
        "How are you feeling right now?",
        "Is this how you want to spend this moment?",
        "What were you actually looking for?",
        
        // Supportive
        "It's okay to set this down.",
        "You've got better things ahead.",
        "The real world misses you.",
    )
    
    // Streak milestone messages - minimal, clean
    val milestoneMessages = mapOf(
        5 to "Nice start — 5 minutes of peace.",
        15 to "15 minutes. You're building momentum.",
        30 to "Half an hour of focus. Impressive.",
        60 to "One whole hour. You've got this.",
        120 to "Two hours. You're on fire.",
        240 to "Four hours of zen. Legendary.",
    )
    
    /**
     * Check if notification permission is granted
     */
    fun hasNotificationPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true // Permission not required pre-Android 13
        }
    }
    
    /**
     * Get a random temptation message
     */
    fun getRandomTemptationMessage(): String {
        return temptationMessages.random()
    }
    
    /**
     * Get milestone message for a given streak duration in minutes
     */
    fun getMilestoneMessage(minutes: Int): String? {
        // Find the highest milestone that's <= current minutes
        return milestoneMessages
            .filter { it.key <= minutes }
            .maxByOrNull { it.key }
            ?.value
    }
    
    /**
     * Get FCM token for push notifications
     */
    suspend fun getFcmToken(): String? = suspendCancellableCoroutine { cont ->
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                cont.resume(token)
            }
            .addOnFailureListener { e ->
                cont.resumeWithException(e)
            }
    }
}
