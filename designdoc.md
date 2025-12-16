# The Phone - Technical Design Document v4

## Executive Summary

The Phone is a mobile app that gamifies reduced screen time through social competition. Users earn points for keeping their phones locked, with logarithmic scoring rewarding longer offline periods. Weekly group leaderboards create accountability through friendly competition.

**Platforms:** iOS (Swift/SwiftUI), Android (Kotlin/Compose)  
**Backend:** Node.js/TypeScript + Fastify  
**Database:** PostgreSQL + Redis

---

## Platform Strategy

### The iOS Constraint

iOS does not allow apps to monitor lock/unlock events from the background. This is intentional and not something we can work around. Our solution: guide users through creating a Shortcuts automation that calls our app on every unlock.

### Architecture Decision: Native Apps (No React Native)

**Decision:** Build native iOS and Android apps with a shared backend.

**Rationale:**
- The tracking layer (the critical path) must be native on both platforms regardless
- React Native would add a bridge layer between JS and native code, creating debugging complexity for the most important functionality
- The UI is straightforward—lists, timers, leaderboards—not complex enough to justify cross-platform overhead
- Native apps are smaller, faster, and have fewer dependencies
- When something breaks, debugging one layer is easier than debugging three
- SwiftUI and Jetpack Compose are both mature and pleasant to work with

**Trade-off acknowledged:** Two UI codebases to maintain. Acceptable because:
- UI is simple and stable after v1
- Platform-specific polish is easier (iOS feels like iOS, Android feels like Android)
- Total complexity is lower than RN + native modules + bridge debugging

---

## System Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   iOS App       │     │  Android App    │
│  Swift/SwiftUI  │     │ Kotlin/Compose  │
│                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │ App Intents │ │     │ │ Broadcast   │ │
│ │ (Shortcuts) │ │     │ │ Receivers   │ │
│ └─────────────┘ │     │ └─────────────┘ │
│                 │     │                 │
│ ┌─────────────┐ │     │ ┌─────────────┐ │
│ │  Core Data  │ │     │ │    Room     │ │
│ └─────────────┘ │     │ └─────────────┘ │
└────────┬────────┘     └────────┬────────┘
         │                       │
         │      HTTPS/JSON       │
         └───────────┬───────────┘
                     │
         ┌───────────▼───────────┐
         │                       │
         │   API Server          │
         │   Node.js/Fastify     │
         │                       │
         └───────────┬───────────┘
                     │
         ┌───────────┴───────────┐
         │                       │
    ┌────▼────┐            ┌─────▼─────┐
    │PostgreSQL│            │   Redis   │
    │         │            │  (cache)  │
    └─────────┘            └───────────┘
```

---

## iOS Implementation

### Shortcuts Integration

Users create a Shortcuts automation that fires our App Intent on every unlock.

**App Intent Definition:**

```swift
import AppIntents
import Foundation

@available(iOS 16.0, *)
struct RecordUnlockIntent: AppIntent {
    static var title: LocalizedStringResource = "Record Unlock"
    static var description = IntentDescription("Records that you unlocked your phone for The Phone app")
    
    // This makes it available in Shortcuts
    static var openAppWhenRun: Bool = false
    
    func perform() async throws -> some IntentResult {
        let event = UnlockEvent(
            id: UUID(),
            timestamp: Date(),
            source: .shortcut
        )
        
        // Store locally
        await EventStore.shared.recordUnlock(event)
        
        // Trigger background sync if possible
        SyncManager.shared.scheduleSync()
        
        return .result()
    }
}

// App Shortcuts provider (makes our intent discoverable)
struct ThePhoneShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: RecordUnlockIntent(),
            phrases: ["Record unlock in \(.applicationName)"],
            shortTitle: "Record Unlock",
            systemImageName: "phone.down"
        )
    }
}
```

**Event Storage:**

```swift
import CoreData

struct UnlockEvent {
    let id: UUID
    let timestamp: Date
    let source: EventSource
    var synced: Bool = false
    var serverId: String?
}

enum EventSource: String, Codable {
    case shortcut       // From Shortcuts automation
    case manual         // Manual session end (fallback)
    case install        // Synthetic event at install
    case verification   // Test unlock during setup
}

actor EventStore {
    static let shared = EventStore()
    
    private let container: NSPersistentContainer
    
    func recordUnlock(_ event: UnlockEvent) async {
        let context = container.newBackgroundContext()
        
        await context.perform {
            let entity = UnlockEventEntity(context: context)
            entity.id = event.id
            entity.timestamp = event.timestamp
            entity.source = event.source.rawValue
            entity.synced = false
            entity.createdAt = Date()
            
            try? context.save()
        }
        
        // Notify UI to update
        await MainActor.run {
            NotificationCenter.default.post(name: .unlockRecorded, object: nil)
        }
    }
    
    func getUnsyncedEvents() async -> [UnlockEvent] {
        // Fetch from Core Data where synced == false
    }
    
    func markSynced(ids: [UUID], serverIds: [String]) async {
        // Update Core Data records
    }
    
    func getLastUnlockTimestamp() async -> Date? {
        // Return most recent unlock timestamp
    }
}
```

### Setup Verification System

**Verification State Machine:**

```swift
enum SetupState: Codable {
    case notStarted
    case inProgress
    case awaitingVerification
    case verified(Date)
    case failed(FailureReason)
    
    enum FailureReason: Codable {
        case noEventReceived
        case automationNotCreated
        case unknown
    }
}

@MainActor
class SetupManager: ObservableObject {
    @Published var state: SetupState = .notStarted
    @Published var verificationCountdown: Int = 0
    
    private var verificationTimer: Timer?
    private var expectedVerificationWindow: ClosedRange<Date>?
    
    func beginVerification() {
        state = .awaitingVerification
        
        // Record the window we're expecting an event in
        let start = Date()
        let end = start.addingTimeInterval(120) // 2 minute window
        expectedVerificationWindow = start...end
        
        // Start countdown UI
        verificationCountdown = 120
        verificationTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.tick()
            }
        }
    }
    
    private func tick() {
        verificationCountdown -= 1
        
        if verificationCountdown <= 0 {
            checkForVerificationEvent()
        }
    }
    
    func checkForVerificationEvent() async {
        verificationTimer?.invalidate()
        
        guard let window = expectedVerificationWindow else {
            state = .failed(.unknown)
            return
        }
        
        // Check if we received an unlock event in the window
        if let lastUnlock = await EventStore.shared.getLastUnlockTimestamp(),
           window.contains(lastUnlock) {
            state = .verified(Date())
            await saveVerificationState()
        } else {
            state = .failed(.noEventReceived)
        }
    }
    
    // Called when an unlock event comes in during verification
    func onUnlockReceived() {
        guard case .awaitingVerification = state else { return }
        
        verificationTimer?.invalidate()
        state = .verified(Date())
        Task { await saveVerificationState() }
    }
}
```

### Tracking Health Monitor

Detects when tracking has likely broken (user deleted Shortcut, etc.):

```swift
actor TrackingHealthMonitor {
    
    struct HealthStatus {
        let isHealthy: Bool
        let issue: HealthIssue?
        let lastCheck: Date
    }
    
    enum HealthIssue {
        case noRecentUnlocks(hoursSinceLastUnlock: Int)
        case appOpenWithoutRecentUnlock
        case neverVerified
    }
    
    func checkHealth() async -> HealthStatus {
        let now = Date()
        
        // Check 1: Was setup ever completed?
        guard let verifiedDate = await getVerificationDate() else {
            return HealthStatus(
                isHealthy: false,
                issue: .neverVerified,
                lastCheck: now
            )
        }
        
        // Check 2: When was the last unlock?
        let lastUnlock = await EventStore.shared.getLastUnlockTimestamp()
        
        if let lastUnlock = lastUnlock {
            let hoursSince = Int(now.timeIntervalSince(lastUnlock) / 3600)
            
            // No unlocks in 24+ hours is suspicious
            // Average user unlocks 50-100+ times daily
            if hoursSince > 24 {
                return HealthStatus(
                    isHealthy: false,
                    issue: .noRecentUnlocks(hoursSinceLastUnlock: hoursSince),
                    lastCheck: now
                )
            }
        } else {
            // No unlocks ever recorded after verification
            // This shouldn't happen
            return HealthStatus(
                isHealthy: false,
                issue: .noRecentUnlocks(hoursSinceLastUnlock: 999),
                lastCheck: now
            )
        }
        
        return HealthStatus(isHealthy: true, issue: nil, lastCheck: now)
    }
    
    // Called every time app comes to foreground
    func onAppForeground() async -> HealthIssue? {
        let lastUnlock = await EventStore.shared.getLastUnlockTimestamp()
        let now = Date()
        
        // If user is opening the app, but we haven't seen an unlock
        // in the last 30 minutes, something might be wrong
        if let lastUnlock = lastUnlock {
            let minutesSince = now.timeIntervalSince(lastUnlock) / 60
            
            if minutesSince > 30 {
                return .appOpenWithoutRecentUnlock
            }
        }
        
        return nil
    }
}
```

### Onboarding Flow

```swift
struct OnboardingView: View {
    @StateObject private var setupManager = SetupManager()
    @State private var currentStep = 0
    
    var body: some View {
        switch currentStep {
        case 0:
            WelcomeStep(onContinue: { currentStep = 1 })
        case 1:
            HowItWorksStep(onContinue: { currentStep = 2 })
        case 2:
            ShortcutsSetupStep(
                setupManager: setupManager,
                onContinue: { currentStep = 3 }
            )
        case 3:
            VerificationStep(
                setupManager: setupManager,
                onSuccess: { currentStep = 4 },
                onRetry: { currentStep = 2 }
            )
        case 4:
            SetupCompleteStep(onFinish: { /* dismiss onboarding */ })
        default:
            EmptyView()
        }
    }
}

struct ShortcutsSetupStep: View {
    @ObservedObject var setupManager: SetupManager
    let onContinue: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Text("One-time setup")
                .font(.title)
                .bold()
            
            Text("Create a Shortcuts automation so we can track your phone-free time.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            // Animated instruction carousel
            InstructionCarousel(steps: [
                InstructionStep(
                    image: "shortcuts-step-1",
                    title: "Open Shortcuts",
                    description: "Tap the button below to open the Shortcuts app"
                ),
                InstructionStep(
                    image: "shortcuts-step-2",
                    title: "Go to Automation",
                    description: "Tap 'Automation' at the bottom of the screen"
                ),
                InstructionStep(
                    image: "shortcuts-step-3",
                    title: "Create automation",
                    description: "Tap '+' then 'Create Personal Automation'"
                ),
                InstructionStep(
                    image: "shortcuts-step-4",
                    title: "Select trigger",
                    description: "Scroll down and tap 'When iPhone is unlocked'"
                ),
                InstructionStep(
                    image: "shortcuts-step-5",
                    title: "Add action",
                    description: "Search for 'The Phone' and select 'Record Unlock'"
                ),
                InstructionStep(
                    image: "shortcuts-step-6",
                    title: "Disable asking",
                    description: "Turn OFF 'Ask Before Running', then tap Done"
                )
            ])
            
            Spacer()
            
            Button("Open Shortcuts") {
                openShortcutsApp()
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            
            Button("I've completed setup") {
                setupManager.beginVerification()
                onContinue()
            }
            .padding(.top, 8)
        }
        .padding()
    }
    
    private func openShortcutsApp() {
        if let url = URL(string: "shortcuts://") {
            UIApplication.shared.open(url)
        }
    }
}

struct VerificationStep: View {
    @ObservedObject var setupManager: SetupManager
    let onSuccess: () -> Void
    let onRetry: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            switch setupManager.state {
            case .awaitingVerification:
                VerificationInProgressView(
                    countdown: setupManager.verificationCountdown
                )
                
            case .verified:
                VerificationSuccessView(onContinue: onSuccess)
                
            case .failed(let reason):
                VerificationFailedView(
                    reason: reason,
                    onRetry: onRetry,
                    onHelp: { /* show help */ }
                )
                
            default:
                EmptyView()
            }
        }
        .padding()
    }
}

struct VerificationInProgressView: View {
    let countdown: Int
    
    var body: some View {
        VStack(spacing: 32) {
            Text("Verify your setup")
                .font(.title)
                .bold()
            
            VStack(spacing: 16) {
                Image(systemName: "iphone")
                    .font(.system(size: 60))
                    .foregroundColor(.blue)
                
                Text("Lock your phone now")
                    .font(.headline)
                
                Text("Press the side button, wait a few seconds, then unlock your phone.")
                    .multilineTextAlignment(.center)
                    .foregroundColor(.secondary)
            }
            
            // Countdown
            Text("Waiting... \(countdown)s")
                .font(.caption)
                .foregroundColor(.secondary)
            
            ProgressView()
        }
    }
}

struct VerificationSuccessView: View {
    let onContinue: () -> Void
    
    var body: some View {
        VStack(spacing: 32) {
            Image(systemName: "checkmark.circle.fill")
                .font(.system(size: 80))
                .foregroundColor(.green)
            
            Text("Setup complete!")
                .font(.title)
                .bold()
            
            Text("Your phone-free time will now be tracked automatically.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            Button("Start using The Phone", action: onContinue)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
    }
}

struct VerificationFailedView: View {
    let reason: SetupManager.SetupState.FailureReason
    let onRetry: () -> Void
    let onHelp: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 60))
                .foregroundColor(.orange)
            
            Text("We didn't detect your unlock")
                .font(.title2)
                .bold()
            
            VStack(alignment: .leading, spacing: 12) {
                Text("Common issues:")
                    .font(.headline)
                
                BulletPoint(text: "'Ask Before Running' is still enabled")
                BulletPoint(text: "Wrong action selected in the automation")
                BulletPoint(text: "Automation wasn't saved")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(Color(.systemGray6))
            .cornerRadius(12)
            
            HStack(spacing: 16) {
                Button("Try again", action: onRetry)
                    .buttonStyle(.borderedProminent)
                
                Button("Get help", action: onHelp)
                    .buttonStyle(.bordered)
            }
        }
    }
}
```

### Health Warning UI

Shown when tracking appears broken:

```swift
struct TrackingHealthBanner: View {
    let issue: TrackingHealthMonitor.HealthIssue
    let onFix: () -> Void
    
    var body: some View {
        HStack {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.orange)
            
            VStack(alignment: .leading) {
                Text("Tracking may be broken")
                    .font(.subheadline)
                    .bold()
                
                Text(issueDescription)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            Button("Fix", action: onFix)
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding()
        .background(Color.orange.opacity(0.1))
        .cornerRadius(12)
    }
    
    private var issueDescription: String {
        switch issue {
        case .noRecentUnlocks(let hours):
            return "No unlocks detected in \(hours) hours"
        case .appOpenWithoutRecentUnlock:
            return "Expected an unlock event but didn't see one"
        case .neverVerified:
            return "Setup was never completed"
        }
    }
}
```

### Gated Functionality

Users cannot participate in scoring until verified:

```swift
struct HomeView: View {
    @StateObject private var viewModel = HomeViewModel()
    
    var body: some View {
        Group {
            if viewModel.isTrackingVerified {
                ActiveHomeView(viewModel: viewModel)
            } else {
                SetupRequiredView(
                    onBeginSetup: { viewModel.showOnboarding = true }
                )
            }
        }
        .sheet(isPresented: $viewModel.showOnboarding) {
            OnboardingView()
        }
    }
}

struct SetupRequiredView: View {
    let onBeginSetup: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "gear.badge.questionmark")
                .font(.system(size: 60))
                .foregroundColor(.secondary)
            
            Text("Setup required")
                .font(.title2)
                .bold()
            
            Text("Complete the one-time setup to start tracking your phone-free time and competing with friends.")
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
            
            Button("Begin setup", action: onBeginSetup)
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
        }
        .padding()
    }
}
```

---

## Android Implementation

Android is straightforward—system broadcasts work reliably.

### Broadcast Receiver

```kotlin
// Registered in manifest (survives process death)
class ScreenStateReceiver : BroadcastReceiver() {
    
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_USER_PRESENT -> {
                // User unlocked (after PIN/biometric)
                recordUnlock(context)
            }
            Intent.ACTION_SCREEN_OFF -> {
                // Screen turned off (locked)
                recordLock(context)
            }
        }
    }
    
    private fun recordUnlock(context: Context) {
        val event = UnlockEvent(
            id = UUID.randomUUID(),
            timestamp = System.currentTimeMillis(),
            source = EventSource.AUTOMATIC
        )
        
        // Insert into Room database
        CoroutineScope(Dispatchers.IO).launch {
            EventDatabase.getInstance(context)
                .eventDao()
                .insert(event.toEntity())
            
            // Schedule sync
            SyncWorker.enqueue(context)
        }
    }
    
    private fun recordLock(context: Context) {
        val event = LockEvent(
            id = UUID.randomUUID(),
            timestamp = System.currentTimeMillis(),
            source = EventSource.AUTOMATIC
        )
        
        CoroutineScope(Dispatchers.IO).launch {
            EventDatabase.getInstance(context)
                .eventDao()
                .insert(event.toEntity())
        }
    }
}
```

### Manifest Registration

```xml
<manifest>
    <application>
        <!-- Broadcast receiver for lock/unlock -->
        <receiver
            android:name=".tracking.ScreenStateReceiver"
            android:enabled="true"
            android:exported="false">
            <intent-filter>
                <action android:name="android.intent.action.USER_PRESENT" />
                <action android:name="android.intent.action.SCREEN_OFF" />
            </intent-filter>
        </receiver>
    </application>
</manifest>
```

### Room Database

```kotlin
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

@Dao
interface EventDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insert(event: EventEntity)
    
    @Query("SELECT * FROM events WHERE synced = 0 ORDER BY timestamp ASC")
    suspend fun getUnsynced(): List<EventEntity>
    
    @Query("UPDATE events SET synced = 1, server_id = :serverId WHERE id = :id")
    suspend fun markSynced(id: String, serverId: String)
    
    @Query("SELECT * FROM events WHERE event_type = 'unlock' ORDER BY timestamp DESC LIMIT 1")
    suspend fun getLastUnlock(): EventEntity?
    
    @Query("SELECT * FROM events WHERE timestamp >= :start AND timestamp < :end ORDER BY timestamp ASC")
    suspend fun getEventsInRange(start: Long, end: Long): List<EventEntity>
}

@Database(entities = [EventEntity::class], version = 1)
abstract class EventDatabase : RoomDatabase() {
    abstract fun eventDao(): EventDao
    
    companion object {
        @Volatile
        private var INSTANCE: EventDatabase? = null
        
        fun getInstance(context: Context): EventDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    EventDatabase::class.java,
                    "thephone.db"
                ).build().also { INSTANCE = it }
            }
        }
    }
}
```

### WorkManager Sync

```kotlin
class SyncWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {
    
    override suspend fun doWork(): Result {
        val eventDao = EventDatabase.getInstance(applicationContext).eventDao()
        val unsyncedEvents = eventDao.getUnsynced()
        
        if (unsyncedEvents.isEmpty()) {
            return Result.success()
        }
        
        return try {
            val response = ApiClient.syncEvents(
                events = unsyncedEvents.map { it.toSyncPayload() },
                lastSync = Preferences.getLastSyncTimestamp(applicationContext)
            )
            
            // Mark events as synced
            response.confirmed.forEach { confirmed ->
                eventDao.markSynced(confirmed.clientId, confirmed.serverId)
            }
            
            // Store new events from server (multi-device)
            response.newEvents.forEach { serverEvent ->
                eventDao.insert(serverEvent.toEntity())
            }
            
            Preferences.setLastSyncTimestamp(applicationContext, response.serverTime)
            
            Result.success()
        } catch (e: Exception) {
            if (runAttemptCount < 3) {
                Result.retry()
            } else {
                Result.failure()
            }
        }
    }
    
    companion object {
        fun enqueue(context: Context) {
            val request = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    Duration.ofMinutes(1)
                )
                .build()
            
            WorkManager.getInstance(context)
                .enqueueUniqueWork(
                    "sync",
                    ExistingWorkPolicy.REPLACE,
                    request
                )
        }
    }
}
```

### Android Onboarding

Android doesn't need the complex Shortcuts setup—just permissions:

```kotlin
@Composable
fun OnboardingScreen(
    onComplete: () -> Unit
) {
    var currentStep by remember { mutableStateOf(0) }
    
    when (currentStep) {
        0 -> WelcomeStep(onContinue = { currentStep = 1 })
        1 -> HowItWorksStep(onContinue = { currentStep = 2 })
        2 -> PermissionsStep(onContinue = { currentStep = 3 })
        3 -> SetupCompleteStep(onFinish = onComplete)
    }
}

@Composable
fun PermissionsStep(onContinue: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Lock,
            contentDescription = null,
            modifier = Modifier.size(80.dp),
            tint = MaterialTheme.colorScheme.primary
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Text(
            text = "Automatic tracking",
            style = MaterialTheme.typography.headlineMedium
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        Text(
            text = "The Phone will automatically track when you lock and unlock your phone. No manual action needed.",
            textAlign = TextAlign.Center,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Battery optimization note
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant
            )
        ) {
            Row(
                modifier = Modifier.padding(16.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
                Spacer(modifier = Modifier.width(12.dp))
                Text(
                    text = "For best results, exclude The Phone from battery optimization in your phone's settings.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        }
        
        Spacer(modifier = Modifier.height(32.dp))
        
        Button(
            onClick = onContinue,
            modifier = Modifier.fillMaxWidth()
        ) {
            Text("Continue")
        }
    }
}
```

---

## Backend Implementation

### Technology Stack

- **Runtime:** Node.js 20 LTS
- **Framework:** Fastify 4.x
- **Language:** TypeScript 5.x
- **Database:** PostgreSQL 16
- **Cache:** Redis 7
- **Job Queue:** BullMQ
- **Auth:** JWT (access + refresh tokens)

### Project Structure

```
server/
├── src/
│   ├── index.ts              # Entry point
│   ├── app.ts                # Fastify app setup
│   ├── config.ts             # Environment config
│   │
│   ├── routes/
│   │   ├── auth.ts           # /auth/*
│   │   ├── events.ts         # /events/*
│   │   ├── users.ts          # /users/*
│   │   ├── social.ts         # /social/*
│   │   ├── groups.ts         # /groups/*
│   │   └── invites.ts        # /invites/*
│   │
│   ├── services/
│   │   ├── auth.service.ts
│   │   ├── event.service.ts
│   │   ├── score.service.ts
│   │   ├── social.service.ts
│   │   ├── group.service.ts
│   │   ├── sync.service.ts
│   │   └── temptation.service.ts
│   │
│   ├── jobs/
│   │   ├── queue.ts          # BullMQ setup
│   │   ├── score.job.ts      # Recalculate scores
│   │   ├── leaderboard.job.ts
│   │   ├── weekly-reset.job.ts
│   │   └── temptation.job.ts # Schedule temptation notifications
│   │
│   ├── db/
│   │   ├── client.ts         # Postgres client
│   │   ├── redis.ts          # Redis client
│   │   └── migrations/       # SQL migrations
│   │
│   ├── middleware/
│   │   ├── auth.ts           # JWT verification
│   │   └── rate-limit.ts
│   │
│   └── utils/
│       ├── scoring.ts        # Score calculations
│       ├── time.ts           # Timezone helpers
│       └── validation.ts
│
├── package.json
├── tsconfig.json
└── Dockerfile
```

### Database Schema

```sql
-- Users
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username        VARCHAR(30) UNIQUE NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    timezone        VARCHAR(50) NOT NULL DEFAULT 'UTC',
    platform        VARCHAR(10) NOT NULL, -- 'ios' or 'android'
    tracking_status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, verified, broken
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settings        JSONB NOT NULL DEFAULT '{}'
);

-- Events (append-only log)
CREATE TABLE events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_id       UUID NOT NULL,
    event_type      VARCHAR(10) NOT NULL CHECK (event_type IN ('lock', 'unlock')),
    timestamp       TIMESTAMPTZ NOT NULL,
    source          VARCHAR(20) NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, client_id)
);

-- Weekly scores (materialized)
CREATE TABLE weekly_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    week_start      DATE NOT NULL,
    total_points    DECIMAL(12, 2) NOT NULL DEFAULT 0,
    streak_count    INTEGER NOT NULL DEFAULT 0,
    longest_streak  INTEGER NOT NULL DEFAULT 0, -- seconds
    calculated_at   TIMESTAMPTZ NOT NULL,
    UNIQUE (user_id, week_start)
);

-- Follows
CREATE TABLE follows (
    follower_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    following_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (follower_id, following_id)
);

-- Groups
CREATE TABLE groups (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    description     TEXT,
    creator_id      UUID NOT NULL REFERENCES users(id),
    is_private      BOOLEAN NOT NULL DEFAULT FALSE,
    invite_code     VARCHAR(20) UNIQUE,
    max_members     INTEGER NOT NULL DEFAULT 50,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Group members
CREATE TABLE group_members (
    group_id        UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(20) NOT NULL DEFAULT 'member',
    joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_id, user_id)
);

-- Invite codes (for app access)
CREATE TABLE invite_codes (
    code            VARCHAR(20) PRIMARY KEY,
    creator_id      UUID NOT NULL REFERENCES users(id),
    used_by         UUID REFERENCES users(id),
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Push tokens for notifications
CREATE TABLE push_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token           TEXT NOT NULL,
    platform        VARCHAR(10) NOT NULL, -- 'ios' or 'android'
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, token)
);

-- Temptation notification settings
CREATE TABLE temptation_settings (
    user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    enabled         BOOLEAN NOT NULL DEFAULT TRUE,
    intensity       VARCHAR(10) NOT NULL DEFAULT 'medium', -- low, medium, high
    quiet_start     TIME, -- e.g., 22:00 (no notifications after this)
    quiet_end       TIME, -- e.g., 07:00 (no notifications before this)
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_events_user_timestamp ON events(user_id, timestamp DESC);
CREATE INDEX idx_weekly_scores_user_week ON weekly_scores(user_id, week_start DESC);
CREATE INDEX idx_weekly_scores_week_points ON weekly_scores(week_start, total_points DESC);
CREATE INDEX idx_group_members_group ON group_members(group_id);
CREATE INDEX idx_follows_following ON follows(following_id);
CREATE INDEX idx_users_tracking_status ON users(tracking_status);
CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);
```

### Event Sync Endpoint

```typescript
// routes/events.ts
import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { syncEvents } from '../services/sync.service';

const syncRequestSchema = z.object({
  events: z.array(z.object({
    id: z.string().uuid(),
    eventType: z.enum(['lock', 'unlock']),
    timestamp: z.number(),
    source: z.string()
  })),
  lastSync: z.number(),
  clientTime: z.number()
});

export async function eventRoutes(app: FastifyInstance) {
  
  app.post('/events/sync', {
    preHandler: [app.authenticate],
    schema: {
      body: syncRequestSchema
    }
  }, async (request, reply) => {
    const userId = request.user.id;
    const body = request.body as z.infer<typeof syncRequestSchema>;
    
    const result = await syncEvents(userId, body);
    
    return result;
  });
}

// services/sync.service.ts
import { db } from '../db/client';
import { scoreQueue } from '../jobs/queue';

interface SyncRequest {
  events: Array<{
    id: string;
    eventType: 'lock' | 'unlock';
    timestamp: number;
    source: string;
  }>;
  lastSync: number;
  clientTime: number;
}

interface SyncResponse {
  confirmed: Array<{ clientId: string; serverId: string }>;
  newEvents: Array<{
    id: string;
    eventType: string;
    timestamp: number;
    source: string;
  }>;
  serverTime: number;
}

export async function syncEvents(
  userId: string,
  request: SyncRequest
): Promise<SyncResponse> {
  const confirmed: SyncResponse['confirmed'] = [];
  const now = Date.now();
  
  // Validate and insert events
  for (const event of request.events) {
    // Reject events > 7 days old
    const maxAge = 7 * 24 * 60 * 60 * 1000;
    if (event.timestamp < now - maxAge) {
      console.log(`Rejecting old event from user ${userId}`, event);
      continue;
    }
    
    // Normalize future timestamps
    let timestamp = event.timestamp;
    if (timestamp > now + 60_000) {
      console.log(`Normalizing future timestamp from user ${userId}`, event);
      timestamp = now;
    }
    
    try {
      const result = await db.query(`
        INSERT INTO events (user_id, client_id, event_type, timestamp, source)
        VALUES ($1, $2, $3, to_timestamp($4::double precision / 1000), $5)
        ON CONFLICT (user_id, client_id) DO NOTHING
        RETURNING id
      `, [userId, event.id, event.eventType, timestamp, event.source]);
      
      if (result.rows.length > 0) {
        confirmed.push({
          clientId: event.id,
          serverId: result.rows[0].id
        });
      }
    } catch (error) {
      console.error('Error inserting event', error);
    }
  }
  
  // Fetch events the client hasn't seen (multi-device sync)
  const newEventsResult = await db.query(`
    SELECT id, event_type, extract(epoch from timestamp) * 1000 as timestamp, source
    FROM events
    WHERE user_id = $1
      AND created_at > to_timestamp($2::double precision / 1000)
      AND client_id NOT IN (${request.events.map((_, i) => `$${i + 3}`).join(',') || "''"})
    ORDER BY timestamp ASC
  `, [userId, request.lastSync, ...request.events.map(e => e.id)]);
  
  // Queue score recalculation
  if (confirmed.length > 0) {
    await scoreQueue.add('recalculate', { userId });
  }
  
  return {
    confirmed,
    newEvents: newEventsResult.rows.map(row => ({
      id: row.id,
      eventType: row.event_type,
      timestamp: Number(row.timestamp),
      source: row.source
    })),
    serverTime: now
  };
}
```

### Score Calculation

**Week Boundary Rule:** Points are assigned to the week containing the unlock event. If you lock on Sunday 11:50pm and unlock Monday 12:10am, Monday's week gets the full streak points.

```typescript
// utils/scoring.ts

const BASE_MULTIPLIER = 10;
const MINIMUM_STREAK_SECONDS = 60;

export function calculateStreakPoints(
  lockTimestamp: number,
  unlockTimestamp: number
): number {
  const durationSeconds = (unlockTimestamp - lockTimestamp) / 1000;
  
  if (durationSeconds < MINIMUM_STREAK_SECONDS) {
    return 0;
  }
  
  const durationMinutes = durationSeconds / 60;
  const points = Math.log(durationMinutes) * BASE_MULTIPLIER;
  
  return Math.max(0, Math.round(points * 100) / 100);
}

// utils/time.ts
export function getWeekStart(date: Date, timezone: string): Date {
  // Week starts Monday 00:00 in user's timezone
  const local = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
  const day = local.getDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  local.setDate(local.getDate() - diff);
  local.setHours(0, 0, 0, 0);
  return local;
}

// services/score.service.ts
import { db } from '../db/client';
import { calculateStreakPoints } from '../utils/scoring';
import { getWeekStart } from '../utils/time';

interface WeeklyScore {
  totalPoints: number;
  streakCount: number;
  longestStreak: number; // seconds
}

export async function calculateWeeklyScore(
  userId: string,
  weekStart: Date
): Promise<WeeklyScore> {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  
  // Fetch all events that could affect this week's score
  // We need lock events from before the week (for streaks spanning week boundary)
  // and unlock events within the week
  const eventsResult = await db.query(`
    WITH week_unlocks AS (
      SELECT id, event_type, extract(epoch from timestamp) * 1000 as timestamp
      FROM events
      WHERE user_id = $1
        AND event_type = 'unlock'
        AND timestamp >= $2
        AND timestamp < $3
      ORDER BY timestamp ASC
    ),
    -- For each unlock, find the preceding lock
    preceding_locks AS (
      SELECT DISTINCT ON (u.id)
        u.id as unlock_id,
        u.timestamp as unlock_timestamp,
        l.id as lock_id,
        extract(epoch from l.timestamp) * 1000 as lock_timestamp
      FROM week_unlocks u
      LEFT JOIN events l ON l.user_id = $1
        AND l.event_type = 'lock'
        AND l.timestamp < to_timestamp(u.timestamp / 1000)
      ORDER BY u.id, l.timestamp DESC
    )
    SELECT unlock_id, unlock_timestamp, lock_id, lock_timestamp
    FROM preceding_locks
    WHERE lock_id IS NOT NULL
  `, [userId, weekStart, weekEnd]);
  
  let totalPoints = 0;
  let streakCount = 0;
  let longestStreak = 0;
  
  for (const row of eventsResult.rows) {
    const lockTimestamp = Number(row.lock_timestamp);
    const unlockTimestamp = Number(row.unlock_timestamp);
    
    const points = calculateStreakPoints(lockTimestamp, unlockTimestamp);
    
    if (points > 0) {
      totalPoints += points;
      streakCount++;
      
      const duration = (unlockTimestamp - lockTimestamp) / 1000;
      longestStreak = Math.max(longestStreak, duration);
    }
  }
  
  return {
    totalPoints: Math.round(totalPoints * 100) / 100,
    streakCount,
    longestStreak: Math.round(longestStreak)
  };
}

export async function updateWeeklyScore(userId: string): Promise<void> {
  const userResult = await db.query(
    'SELECT timezone FROM users WHERE id = $1',
    [userId]
  );
  const timezone = userResult.rows[0]?.timezone || 'UTC';
  
  const weekStart = getWeekStart(new Date(), timezone);
  const score = await calculateWeeklyScore(userId, weekStart);
  
  await db.query(`
    INSERT INTO weekly_scores (user_id, week_start, total_points, streak_count, longest_streak, calculated_at)
    VALUES ($1, $2, $3, $4, $5, NOW())
    ON CONFLICT (user_id, week_start) DO UPDATE SET
      total_points = $3,
      streak_count = $4,
      longest_streak = $5,
      calculated_at = NOW()
  `, [userId, weekStart, score.totalPoints, score.streakCount, score.longestStreak]);
}
```

### Leaderboard Endpoint

```typescript
// routes/groups.ts
import { FastifyInstance } from 'fastify';
import { getGroupLeaderboard } from '../services/group.service';

export async function groupRoutes(app: FastifyInstance) {
  
  app.get('/groups/:id/leaderboard', {
    preHandler: [app.authenticate]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;
    
    // Verify user is member of group
    const isMember = await checkGroupMembership(userId, id);
    if (!isMember) {
      return reply.status(403).send({ error: 'Not a member of this group' });
    }
    
    const leaderboard = await getGroupLeaderboard(id);
    return leaderboard;
  });
}

// services/group.service.ts
import { redis } from '../db/redis';
import { db } from '../db/client';
import { getWeekStart } from '../utils/time';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  totalPoints: number;
  streakCount: number;
  longestStreak: number;
  trackingStatus: string;
}

export async function getGroupLeaderboard(
  groupId: string
): Promise<LeaderboardEntry[]> {
  const weekStart = getWeekStart(new Date(), 'UTC');
  const cacheKey = `leaderboard:${groupId}:${weekStart.toISOString().split('T')[0]}`;
  
  // Check cache
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }
  
  // Calculate leaderboard
  const result = await db.query(`
    SELECT
      u.id as user_id,
      u.username,
      u.tracking_status,
      COALESCE(ws.total_points, 0) as total_points,
      COALESCE(ws.streak_count, 0) as streak_count,
      COALESCE(ws.longest_streak, 0) as longest_streak
    FROM group_members gm
    JOIN users u ON u.id = gm.user_id
    LEFT JOIN weekly_scores ws ON ws.user_id = u.id AND ws.week_start = $2
    WHERE gm.group_id = $1
    ORDER BY total_points DESC, longest_streak DESC
  `, [groupId, weekStart]);
  
  const leaderboard: LeaderboardEntry[] = result.rows.map((row, index) => ({
    rank: index + 1,
    userId: row.user_id,
    username: row.username,
    totalPoints: Number(row.total_points),
    streakCount: row.streak_count,
    longestStreak: row.longest_streak,
    trackingStatus: row.tracking_status
  }));
  
  // Cache for 5 minutes
  await redis.set(cacheKey, JSON.stringify(leaderboard), 'EX', 300);
  
  return leaderboard;
}
```

---

## Temptation Notifications

The app sends push notifications designed to tempt users into unlocking their phones. The longer you resist, the more points you earn. This inverts the typical notification model—instead of notifications being a distraction you fight against, they become part of the game.

### Philosophy

Most apps send notifications to increase engagement. We send notifications to test your resolve. Every notification is an opportunity: give in and end your streak, or resist and watch your points grow.

### Notification Types

| Type | Trigger | Example Content |
|------|---------|-----------------|
| Curiosity | Random during streak | "Something interesting might have happened..." |
| Social | When friends are active | "3 friends just checked their phones..." |
| FOMO | Time-based | "You've been offline for 2 hours. Miss anything?" |
| Taunt | Long streak | "Still going? Most people would have checked by now." |
| Fake urgency | Random | "Quick question..." (no actual content) |

### Implementation

```typescript
// services/temptation.service.ts
import { db } from '../db/client';
import { redis } from '../db/redis';
import * as apn from 'apn';
import * as admin from 'firebase-admin';

interface TemptationConfig {
  userId: string;
  intensity: 'low' | 'medium' | 'high';
  quietStart: string | null; // HH:MM
  quietEnd: string | null;
  timezone: string;
}

const NOTIFICATION_TEMPLATES = {
  curiosity: [
    "Something interesting might have happened...",
    "Wonder what's going on?",
    "Just checking in...",
    "Anything new?",
    "👀",
  ],
  social: [
    "{count} friends just checked their phones...",
    "Your friends are online...",
    "Someone might be trying to reach you...",
  ],
  fomo: [
    "You've been offline for {duration}. Miss anything?",
    "The world keeps turning while you're away...",
    "A lot can happen in {duration}...",
  ],
  taunt: [
    "Still going? Impressive.",
    "Most people would have checked by now.",
    "Your willpower is being tested...",
    "One little peek wouldn't hurt, right?",
  ],
  fake_urgency: [
    "Quick question...",
    "Hey",
    "Did you see—",
    "FYI:",
    "Update:",
  ],
};

// Frequency based on intensity (notifications per hour during active streak)
const FREQUENCY_MAP = {
  low: 0.5,    // ~1 every 2 hours
  medium: 1,   // ~1 per hour
  high: 2,     // ~2 per hour
};

export async function scheduleTemptation(userId: string): Promise<void> {
  const config = await getTemptationConfig(userId);
  
  if (!config || !isWithinActiveHours(config)) {
    return;
  }
  
  // Check if user is in an active streak
  const lastEvent = await getLastEvent(userId);
  if (!lastEvent || lastEvent.eventType !== 'lock') {
    return; // Not in a streak
  }
  
  const streakDuration = Date.now() - lastEvent.timestamp;
  const streakMinutes = streakDuration / 60000;
  
  // Don't tempt during first 5 minutes (let them settle)
  if (streakMinutes < 5) {
    return;
  }
  
  // Select notification type based on streak duration
  const type = selectNotificationType(streakMinutes);
  const content = await generateContent(type, userId, streakMinutes);
  
  await sendPushNotification(userId, content);
  
  // Schedule next temptation
  const frequency = FREQUENCY_MAP[config.intensity];
  const nextDelayMs = (60 / frequency) * 60 * 1000 * (0.5 + Math.random()); // Randomize
  
  await redis.set(
    `next_temptation:${userId}`,
    Date.now() + nextDelayMs,
    'PX',
    nextDelayMs
  );
}

function selectNotificationType(streakMinutes: number): string {
  if (streakMinutes < 30) {
    return 'curiosity';
  } else if (streakMinutes < 60) {
    return Math.random() < 0.5 ? 'curiosity' : 'fake_urgency';
  } else if (streakMinutes < 120) {
    return ['fomo', 'social', 'fake_urgency'][Math.floor(Math.random() * 3)];
  } else {
    return Math.random() < 0.3 ? 'taunt' : 'fomo';
  }
}

async function generateContent(
  type: string,
  userId: string,
  streakMinutes: number
): Promise<string> {
  const templates = NOTIFICATION_TEMPLATES[type as keyof typeof NOTIFICATION_TEMPLATES];
  const template = templates[Math.floor(Math.random() * templates.length)];
  
  let content = template;
  
  // Replace placeholders
  if (content.includes('{duration}')) {
    const hours = Math.floor(streakMinutes / 60);
    const mins = Math.floor(streakMinutes % 60);
    const duration = hours > 0 ? `${hours}h ${mins}m` : `${mins} minutes`;
    content = content.replace('{duration}', duration);
  }
  
  if (content.includes('{count}')) {
    // Get actual count of friends who unlocked recently
    const count = await getRecentFriendUnlocks(userId) || Math.floor(Math.random() * 5) + 1;
    content = content.replace('{count}', count.toString());
  }
  
  return content;
}

function isWithinActiveHours(config: TemptationConfig): boolean {
  if (!config.quietStart || !config.quietEnd) {
    return true;
  }
  
  const now = new Date();
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: config.timezone }));
  const currentMinutes = userTime.getHours() * 60 + userTime.getMinutes();
  
  const [quietStartH, quietStartM] = config.quietStart.split(':').map(Number);
  const [quietEndH, quietEndM] = config.quietEnd.split(':').map(Number);
  
  const quietStartMinutes = quietStartH * 60 + quietStartM;
  const quietEndMinutes = quietEndH * 60 + quietEndM;
  
  // Handle overnight quiet hours (e.g., 22:00 to 07:00)
  if (quietStartMinutes > quietEndMinutes) {
    return currentMinutes >= quietEndMinutes && currentMinutes < quietStartMinutes;
  } else {
    return currentMinutes < quietStartMinutes || currentMinutes >= quietEndMinutes;
  }
}

async function sendPushNotification(userId: string, content: string): Promise<void> {
  const tokens = await db.query(
    'SELECT token, platform FROM push_tokens WHERE user_id = $1',
    [userId]
  );
  
  for (const { token, platform } of tokens.rows) {
    if (platform === 'ios') {
      await sendAPNS(token, content);
    } else {
      await sendFCM(token, content);
    }
  }
}

// jobs/temptation.job.ts
// Runs every 5 minutes to check who needs tempting
export async function processTemptations(): Promise<void> {
  // Get all users with:
  // - temptations enabled
  // - currently in a streak (last event is lock)
  // - no scheduled temptation pending
  
  const usersToTempt = await db.query(`
    SELECT DISTINCT u.id
    FROM users u
    JOIN temptation_settings ts ON ts.user_id = u.id AND ts.enabled = TRUE
    JOIN LATERAL (
      SELECT event_type, timestamp
      FROM events
      WHERE user_id = u.id
      ORDER BY timestamp DESC
      LIMIT 1
    ) last_event ON last_event.event_type = 'lock'
    WHERE u.tracking_status = 'verified'
  `);
  
  for (const { id } of usersToTempt.rows) {
    // Check if temptation already scheduled
    const scheduled = await redis.get(`next_temptation:${id}`);
    if (!scheduled || Number(scheduled) < Date.now()) {
      await scheduleTemptation(id);
    }
  }
}
```

### Client-Side Settings

```swift
// iOS
struct TemptationSettingsView: View {
    @State private var enabled = true
    @State private var intensity: Intensity = .medium
    @State private var quietHoursEnabled = false
    @State private var quietStart = Date()
    @State private var quietEnd = Date()
    
    enum Intensity: String, CaseIterable {
        case low = "Gentle"
        case medium = "Moderate"
        case high = "Relentless"
        
        var description: String {
            switch self {
            case .low: return "~1 notification every 2 hours"
            case .medium: return "~1 notification per hour"
            case .high: return "~2 notifications per hour"
            }
        }
    }
    
    var body: some View {
        Form {
            Section {
                Toggle("Enable temptation notifications", isOn: $enabled)
            } footer: {
                Text("We'll send notifications designed to tempt you into checking your phone. Resist them to prove your willpower.")
            }
            
            if enabled {
                Section("Intensity") {
                    Picker("Intensity", selection: $intensity) {
                        ForEach(Intensity.allCases, id: \.self) { level in
                            Text(level.rawValue).tag(level)
                        }
                    }
                    .pickerStyle(.segmented)
                    
                    Text(intensity.description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
                
                Section {
                    Toggle("Quiet hours", isOn: $quietHoursEnabled)
                    
                    if quietHoursEnabled {
                        DatePicker("Start", selection: $quietStart, displayedComponents: .hourAndMinute)
                        DatePicker("End", selection: $quietEnd, displayedComponents: .hourAndMinute)
                    }
                } footer: {
                    Text("No temptation notifications during quiet hours.")
                }
            }
        }
        .navigationTitle("Temptations")
    }
}
```

---

## Privacy & Data Protection

### Data We Collect

| Data Type | Purpose | Retention |
|-----------|---------|-----------|
| Lock/unlock timestamps | Core functionality (scoring) | 90 days |
| Username, email | Account identity | Until deletion |
| Push tokens | Notifications | Until logout/deletion |
| Group memberships | Social features | Until leave/deletion |

### What We Don't Collect

- Screen content or app usage
- Location data
- Contacts or messages
- Any data when phone is unlocked
- Device identifiers beyond push tokens

### GDPR Compliance

**Lawful Basis:** Consent (users explicitly agree during onboarding)

**User Rights Implementation:**

```typescript
// routes/users.ts

// Right to access (data export)
app.get('/users/me/export', {
  preHandler: [app.authenticate]
}, async (request, reply) => {
  const userId = request.user.id;
  
  const userData = await exportUserData(userId);
  
  reply.header('Content-Type', 'application/json');
  reply.header('Content-Disposition', `attachment; filename="thephone-data-${userId}.json"`);
  
  return userData;
});

// Right to erasure (account deletion)
app.delete('/users/me', {
  preHandler: [app.authenticate]
}, async (request, reply) => {
  const userId = request.user.id;
  
  await deleteUserData(userId);
  
  return { success: true };
});

// services/privacy.service.ts
export async function exportUserData(userId: string): Promise<object> {
  const [user, events, scores, groups, follows] = await Promise.all([
    db.query('SELECT id, username, email, timezone, platform, created_at FROM users WHERE id = $1', [userId]),
    db.query('SELECT event_type, timestamp, source FROM events WHERE user_id = $1 ORDER BY timestamp', [userId]),
    db.query('SELECT week_start, total_points, streak_count, longest_streak FROM weekly_scores WHERE user_id = $1', [userId]),
    db.query(`
      SELECT g.name, gm.role, gm.joined_at 
      FROM group_members gm 
      JOIN groups g ON g.id = gm.group_id 
      WHERE gm.user_id = $1
    `, [userId]),
    db.query(`
      SELECT 
        (SELECT username FROM users WHERE id = f.following_id) as following,
        f.created_at
      FROM follows f WHERE f.follower_id = $1
    `, [userId]),
  ]);
  
  return {
    exportedAt: new Date().toISOString(),
    account: user.rows[0],
    events: events.rows,
    weeklyScores: scores.rows,
    groups: groups.rows,
    following: follows.rows,
  };
}

export async function deleteUserData(userId: string): Promise<void> {
  // Cascading deletes handle most relations
  // But we explicitly delete to ensure completeness
  
  await db.query('BEGIN');
  
  try {
    // Remove from groups (triggers cascade)
    await db.query('DELETE FROM group_members WHERE user_id = $1', [userId]);
    
    // Remove follows (both directions)
    await db.query('DELETE FROM follows WHERE follower_id = $1 OR following_id = $1', [userId]);
    
    // Remove events
    await db.query('DELETE FROM events WHERE user_id = $1', [userId]);
    
    // Remove scores
    await db.query('DELETE FROM weekly_scores WHERE user_id = $1', [userId]);
    
    // Remove push tokens
    await db.query('DELETE FROM push_tokens WHERE user_id = $1', [userId]);
    
    // Remove temptation settings
    await db.query('DELETE FROM temptation_settings WHERE user_id = $1', [userId]);
    
    // Remove user (this would cascade anyway, but explicit)
    await db.query('DELETE FROM users WHERE id = $1', [userId]);
    
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  
  // Clear any cached data
  const cacheKeys = await redis.keys(`*:${userId}:*`);
  if (cacheKeys.length > 0) {
    await redis.del(...cacheKeys);
  }
}
```

### Data Retention Job

```typescript
// jobs/data-retention.job.ts
// Runs daily at 03:00 UTC

export async function purgeOldEvents(): Promise<void> {
  const retentionDays = 90;
  
  const result = await db.query(`
    DELETE FROM events
    WHERE timestamp < NOW() - INTERVAL '${retentionDays} days'
    RETURNING id
  `);
  
  console.log(`Purged ${result.rowCount} events older than ${retentionDays} days`);
}
```

### Privacy Policy Requirements

The app must include a privacy policy covering:

1. What data is collected and why
2. How data is stored and protected
3. Data retention periods
4. Third-party sharing (none, except push notification services)
5. User rights (access, export, deletion)
6. Contact information for privacy inquiries
7. Cookie policy (N/A for mobile app)

**In-App Transparency:**

```swift
struct PrivacyInfoView: View {
    var body: some View {
        List {
            Section("What we collect") {
                InfoRow(icon: "clock", title: "Lock/unlock times", detail: "To calculate your score")
                InfoRow(icon: "person", title: "Username & email", detail: "For your account")
                InfoRow(icon: "bell", title: "Push token", detail: "To send notifications")
            }
            
            Section("What we don't collect") {
                InfoRow(icon: "xmark.circle", title: "Screen content", detail: "Never")
                InfoRow(icon: "xmark.circle", title: "App usage", detail: "Never")
                InfoRow(icon: "xmark.circle", title: "Location", detail: "Never")
                InfoRow(icon: "xmark.circle", title: "Contacts", detail: "Never")
            }
            
            Section("Your rights") {
                NavigationLink("Export my data") { DataExportView() }
                NavigationLink("Delete my account") { AccountDeletionView() }
            }
            
            Section {
                Link("Full privacy policy", destination: URL(string: "https://thephone.app/privacy")!)
            }
        }
        .navigationTitle("Privacy")
    }
}
```

---

## Background Jobs

```typescript
// jobs/queue.ts
import { Queue, Worker } from 'bullmq';
import { redis } from '../db/redis';

export const scoreQueue = new Queue('scores', { connection: redis });
export const temptationQueue = new Queue('temptations', { connection: redis });

// jobs/score.job.ts
import { Worker, Job } from 'bullmq';
import { redis } from '../db/redis';
import { updateWeeklyScore } from '../services/score.service';

const worker = new Worker('scores', async (job: Job) => {
  switch (job.name) {
    case 'recalculate':
      await updateWeeklyScore(job.data.userId);
      break;
  }
}, { connection: redis });

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err);
});

// jobs/weekly-reset.job.ts
// Runs Monday 00:00 UTC via cron
import { db } from '../db/client';
import { redis } from '../db/redis';

export async function weeklyReset() {
  // Clear all leaderboard caches
  const keys = await redis.keys('leaderboard:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
  
  console.log('Weekly reset complete');
}
```

---

## Offline-First Architecture

### Sync Protocol

Both platforms implement the same sync behavior:

1. Events are recorded locally first (always succeeds)
2. Sync is attempted immediately after recording
3. If sync fails, events queue until next successful sync
4. On app foreground, sync is attempted
5. Periodic background sync (WorkManager on Android, BGTaskScheduler on iOS)

### Conflict Resolution

Events are immutable and append-only. The server accepts all valid events and sorts by timestamp. "Conflicts" don't really exist—we just merge event streams.

Edge case: Two devices record different events at similar timestamps. Resolution: Both events are accepted. Score calculation handles interleaved events correctly.

### Offline Capabilities

| Feature | Offline | Notes |
|---------|---------|-------|
| Track events | ✅ Full | Local storage |
| Current streak | ✅ Full | Calculated locally |
| Weekly score | ✅ Full | Calculated locally |
| Leaderboards | ⚠️ Stale | Shows cached data with timestamp |
| Social feed | ⚠️ Stale | Cached |
| Follow/unfollow | 📋 Queued | Syncs when online |
| Join group | 📋 Queued | Syncs when online |

---

## Infrastructure

### Hosting

**Backend:** Railway or Fly.io
- Container-based deployment
- Auto-scaling
- Managed PostgreSQL
- Managed Redis

**Why Railway/Fly over AWS:**
- Simpler for small team
- Built-in databases
- Reasonable pricing at our scale
- Can migrate to AWS later if needed

### Environments

| Environment | Purpose | Database |
|-------------|---------|----------|
| Local | Development | Docker Postgres |
| Staging | Testing | Railway (separate instance) |
| Production | Users | Railway (production instance) |

### CI/CD

```yaml
# .github/workflows/deploy.yml
name: Deploy

on:
  push:
    branches: [main, staging]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
      redis:
        image: redis:7
        ports:
          - 6379:6379
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm test
        env:
          DATABASE_URL: postgresql://postgres:test@localhost:5432/test
          REDIS_URL: redis://localhost:6379

  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/staging'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.staging.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_STAGING_TOKEN }}

  deploy-production:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --config fly.production.toml
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_PRODUCTION_TOKEN }}
```

---

## Tracking Status & Social Visibility

Users with broken tracking are visible to their groups:

```typescript
// Tracking status values
type TrackingStatus = 'pending' | 'verified' | 'broken';

// pending: Setup not completed
// verified: Setup completed and working
// broken: Health check detected issues
```

In leaderboards, users with `broken` or `pending` status show a warning indicator. Their score may be stale/frozen.

This creates social pressure to fix tracking issues—friends will notice and ask.

---

## API Endpoints Summary

```
Authentication
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

Events
POST   /events/sync

Users
GET    /users/me
PUT    /users/me
PUT    /users/me/tracking-status
GET    /users/me/export          # GDPR data export
DELETE /users/me                 # GDPR account deletion
GET    /users/:username

Social
POST   /social/follow/:userId
DELETE /social/follow/:userId
GET    /social/followers
GET    /social/following
GET    /social/feed

Groups
POST   /groups
GET    /groups
GET    /groups/:id
POST   /groups/:id/join
DELETE /groups/:id/leave
GET    /groups/:id/leaderboard
PUT    /groups/:id (admin)
DELETE /groups/:id (admin)

Invites
POST   /invites
GET    /invites/me
POST   /invites/redeem

Temptations
GET    /temptations/settings
PUT    /temptations/settings
POST   /push-tokens              # Register device for push
DELETE /push-tokens/:token       # Unregister device
```

---

## Development Phases

### Phase 1: Core (Weeks 1-6)

**Week 1-2: Backend Foundation**
- Project setup, CI/CD
- Database schema, migrations
- Auth endpoints
- Event sync endpoint

**Week 3-4: Android App**
- Broadcast receiver implementation
- Local storage (Room)
- Sync logic
- Basic UI (Home, onboarding)

**Week 5-6: iOS App**
- App Intents implementation
- Shortcuts integration
- Verification flow
- Core Data storage
- Basic UI

### Phase 2: Social (Weeks 7-9)

**Week 7: Social Backend**
- Follow system
- Social feed
- Profile endpoints

**Week 8: Groups Backend**
- Group CRUD
- Membership
- Leaderboards

**Week 9: Social UI (Both Platforms)**
- Social feed screens
- Group screens
- Leaderboard UI

### Phase 3: Polish (Weeks 10-12)

**Week 10: Health Monitoring & Temptations**
- iOS tracking health checks
- Warning UI
- Re-verification flow
- Temptation notification system
- Push notification infrastructure

**Week 11: Privacy & Edge Cases**
- Data export endpoint
- Account deletion flow
- Timezone handling
- Offline improvements
- Privacy policy and in-app transparency

**Week 12: Launch Prep**
- App store submissions
- Beta testing
- Bug fixes

---

## Success Metrics

**Core**
- Event sync reliability (target: 99.9%)
- iOS verification completion rate (target: >90%)
- Score calculation accuracy (target: 100%)

**Engagement**
- DAU/WAU ratio
- Average streaks per user per week
- Average streak duration
- Temptation notification resistance rate

**Social**
- Groups joined per user
- Leaderboard views per week

**Retention**
- Day 1, 7, 30 retention
- Weekly cohort retention

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| iOS Shortcuts breaks in future iOS | Manual session fallback always available |
| Users don't complete iOS setup | Clear onboarding, no functionality until verified |
| Users delete Shortcut | Health monitoring detects, prompts re-setup |
| Battery drain concerns | Event-based (not polling), minimal background work |
| Clock manipulation | Timestamp validation, anomaly logging |
| Privacy regulations | GDPR-compliant from day one, minimal data collection |

---

*Document Version: 4.0*
*Last Updated: December 2025*