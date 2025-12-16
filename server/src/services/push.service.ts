import admin from 'firebase-admin';
import { config } from '../config.js';
import { db } from '../db/client.js';

/**
 * Push Notification Service
 * 
 * Handles sending push notifications via Firebase Cloud Messaging (FCM).
 * 
 * Notification types:
 * - temptation: Gentle reminders to put phone down (the core feature)
 * - social: Friend activity updates
 * - weekly: Weekly summary notifications
 */

// Initialize Firebase Admin SDK
// Expects GOOGLE_APPLICATION_CREDENTIALS env var to point to service account JSON
let firebaseInitialized = false;

function initializeFirebase() {
    if (firebaseInitialized) return;

    try {
        // Check if running in production with credentials
        if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            admin.initializeApp({
                credential: admin.credential.applicationDefault(),
            });
            firebaseInitialized = true;
            console.log('Firebase Admin SDK initialized');
        } else {
            console.warn('GOOGLE_APPLICATION_CREDENTIALS not set - push notifications disabled');
        }
    } catch (error) {
        console.error('Failed to initialize Firebase:', error);
    }
}

// Temptation message templates - warm, encouraging, not preachy
const temptationMessages = [
    { title: "Hey.", body: "Just checking in. 👋" },
    { title: "Quick thought", body: "The world outside is still there." },
    { title: "Pause", body: "Take a breath. It's okay." },
    { title: "You're doing great", body: "Maybe take a moment?" },
    { title: "Remember", body: "Every small step counts." },
    { title: "Plot twist", body: "Nothing urgent happened. 📱" },
    { title: "Gentle nudge", body: "This scroll can wait." },
    { title: "Check in", body: "How are you feeling right now?" },
    { title: "It's okay", body: "You can set this down." },
    { title: "Real talk", body: "What were you actually looking for?" },
];

interface NotificationPayload {
    type: 'temptation' | 'social' | 'weekly';
    title: string;
    body: string;
    data?: Record<string, string>;
}

/**
 * Send a push notification to a specific user
 */
export async function sendNotificationToUser(
    userId: string,
    payload: NotificationPayload
): Promise<boolean> {
    if (!firebaseInitialized) {
        initializeFirebase();
        if (!firebaseInitialized) return false;
    }

    try {
        // Get user's push tokens
        const result = await db.query(
            'SELECT token FROM push_tokens WHERE user_id = $1 AND platform = $2',
            [userId, 'android'] // iOS would be separate
        );

        if (result.rows.length === 0) {
            return false;
        }

        const tokens = result.rows.map(r => r.token);

        // Send to all user's devices
        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: {
                title: payload.title,
                body: payload.body,
            },
            data: {
                type: payload.type,
                title: payload.title,
                body: payload.body,
                ...payload.data,
            },
            android: {
                priority: 'normal',
                notification: {
                    channelId: payload.type,
                    sound: 'default',
                },
            },
        });

        // Clean up invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === 'messaging/invalid-registration-token' ||
                        errorCode === 'messaging/registration-token-not-registered'
                    ) {
                        invalidTokens.push(tokens[idx]);
                    }
                }
            });

            if (invalidTokens.length > 0) {
                await db.query(
                    'DELETE FROM push_tokens WHERE token = ANY($1)',
                    [invalidTokens]
                );
            }
        }

        return response.successCount > 0;
    } catch (error) {
        console.error('Failed to send notification:', error);
        return false;
    }
}

/**
 * Send a random temptation message to a user
 */
export async function sendTemptationNotification(userId: string): Promise<boolean> {
    const message = temptationMessages[Math.floor(Math.random() * temptationMessages.length)];

    return sendNotificationToUser(userId, {
        type: 'temptation',
        title: message.title,
        body: message.body,
    });
}

/**
 * Send a social notification (friend activity)
 */
export async function sendSocialNotification(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
): Promise<boolean> {
    return sendNotificationToUser(userId, {
        type: 'social',
        title,
        body,
        data,
    });
}

/**
 * Send weekly summary notification
 */
export async function sendWeeklySummaryNotification(
    userId: string,
    totalPoints: number,
    rank: number,
    groupName?: string
): Promise<boolean> {
    const rankSuffix = rank === 1 ? 'st' : rank === 2 ? 'nd' : rank === 3 ? 'rd' : 'th';

    const title = groupName
        ? `Your week in ${groupName}`
        : 'Your week in review';

    const body = groupName
        ? `You finished ${rank}${rankSuffix} with ${totalPoints.toFixed(1)} points!`
        : `You earned ${totalPoints.toFixed(1)} points this week.`;

    return sendNotificationToUser(userId, {
        type: 'weekly',
        title,
        body,
        data: {
            totalPoints: totalPoints.toString(),
            rank: rank.toString(),
        },
    });
}
