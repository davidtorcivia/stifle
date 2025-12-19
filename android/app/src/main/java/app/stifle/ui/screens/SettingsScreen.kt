package app.stifle.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn // Added
import androidx.compose.foundation.lazy.items // Added
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add // Added
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Person // Added
import androidx.compose.material.icons.filled.Search // Added
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import app.stifle.network.InviteCode
import app.stifle.network.TemptationSettings
import app.stifle.network.UpdateTemptationRequest
import app.stifle.network.UserProfile
import app.stifle.network.UpdateProfileRequest // Added import
import app.stifle.network.UsersApi
import app.stifle.data.local.TokenManager
import app.stifle.data.repository.FriendsRepository // Added
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    usersApi: UsersApi,
    friendsRepository: FriendsRepository,
    tokenManager: TokenManager,
    onNavigateBack: () -> Unit,
    onLogout: () -> Unit
) {
    var profile by remember { mutableStateOf<UserProfile?>(null) }
    var settings by remember { mutableStateOf<TemptationSettings?>(null) }
    var inviteCodes by remember { mutableStateOf<List<InviteCode>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var isSaving by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var showEditUsernameDialog by remember { mutableStateOf(false) }
    var showChangePasswordDialog by remember { mutableStateOf(false) }
    var showChangeEmailDialog by remember { mutableStateOf(false) }
    var snackbarMessage by remember { mutableStateOf<String?>(null) }
    
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    val snackbarHostState = remember { SnackbarHostState() }
    
    // Load data
    LaunchedEffect(Unit) {
        try {
            val profileResponse = usersApi.getMe()
            if (profileResponse.isSuccessful) {
                profile = profileResponse.body()
            }
            
            val settingsResponse = usersApi.getTemptationSettings()
            if (settingsResponse.isSuccessful) {
                settings = settingsResponse.body()
            }
            
            val invitesResponse = usersApi.getInvites()
            if (invitesResponse.isSuccessful) {
                inviteCodes = invitesResponse.body() ?: emptyList()
            }
        } catch (_: Exception) {}
    }
    
    val themeMode by tokenManager.getThemeModeFlow().collectAsState(initial = "system")

    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
             snackbarHostState.showSnackbar(it)
             snackbarMessage = null
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            CenterAlignedTopAppBar(
                title = { 
                    Text(
                        "Settings",
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                    ) 
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = Color.Transparent
                ),
                windowInsets = WindowInsets(0, 0, 0, 0)
            )
        },
        contentWindowInsets = WindowInsets(0, 0, 0, 0)
    ) { padding ->
        // Remember scroll state at this level so it persists across loading state changes
        val scrollState = rememberScrollState()
        
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(scrollState)
                .padding(horizontal = 24.dp)
        ) {
                    Spacer(modifier = Modifier.height(16.dp))

                // === APPEARANCE ===
                Text(
                    text = "Appearance",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                
                Row(
                   modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                   horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                   listOf("system" to "Auto", "light" to "Light", "dark" to "Dark").forEach { (mode, label) ->
                        val isSelected = themeMode == mode
                        Column(
                            modifier = Modifier
                                .weight(1f)
                                .clickable { scope.launch { tokenManager.setThemeMode(mode) } },
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = label,
                                style = if (isSelected) MaterialTheme.typography.titleMedium else MaterialTheme.typography.bodyLarge,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            if (isSelected) {
                                Box(
                                    modifier = Modifier
                                        .padding(top = 4.dp)
                                        .size(4.dp)
                                        .background(MaterialTheme.colorScheme.primary, androidx.compose.foundation.shape.CircleShape)
                                )
                            }
                        }
                   }
                }
                
                Spacer(modifier = Modifier.height(32.dp))
                
                // === PROFILE ===
                Text(
                    text = "Profile",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                
                // Username
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Username", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(profile?.username ?: "—", style = MaterialTheme.typography.bodyLarge)
                    }
                    TextButton(onClick = { showEditUsernameDialog = true }) { Text("Edit") }
                }

                // Email
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Email", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(profile?.email ?: "—", style = MaterialTheme.typography.bodyLarge)
                    }
                    // Email change in Security section
                }
                
                // Timezone
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text("Timezone", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(profile?.timezone ?: "UTC", style = MaterialTheme.typography.bodyLarge)
                    }
                    TextButton(onClick = { 
                        val timeZone = java.util.TimeZone.getDefault().id
                        if (timeZone != profile?.timezone) {
                            scope.launch {
                                try {
                                    isSaving = true
                                    val response = usersApi.updateProfile(UpdateProfileRequest(timezone = timeZone))
                                    if (response.isSuccessful) {
                                        profile = profile?.copy(timezone = timeZone)
                                        snackbarMessage = "Timezone updated to $timeZone"
                                    } else if (response.code() == 429) {
                                        snackbarMessage = "Timezone locked: Can only update once every 7 days"
                                    }
                                } catch (e: Exception) {
                                    snackbarMessage = "Error updating timezone"
                                } finally { isSaving = false }
                            }
                        } else {
                            snackbarMessage = "Already set to current device timezone"
                        }
                    }) { Text("Sync") }
                }
                
                Spacer(modifier = Modifier.height(32.dp))

                // === INVITES ===
                Text(
                    text = "Invites",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                
                val unusedCodes = inviteCodes.filter { !it.used }
                if (unusedCodes.isEmpty()) {
                    Text(
                        "No invite codes available",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(vertical = 8.dp)
                    )
                    OutlinedButton(
                        onClick = {
                            scope.launch {
                                try {
                                    val response = usersApi.createInvite()
                                    if (response.isSuccessful) inviteCodes = usersApi.getInvites().body() ?: emptyList()
                                } catch (_: Exception) {}
                            }
                        },
                        shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) { Text("Generate Invite Code") }
                } else {
                    unusedCodes.take(3).forEach { code ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(code.code, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace)
                            Row {
                                IconButton(onClick = { clipboardManager.setText(AnnotatedString(code.code)) }) {
                                    Icon(Icons.Default.ContentCopy, "Copy")
                                }
                                IconButton(onClick = {
                                    val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                        type = "text/plain"
                                        putExtra(Intent.EXTRA_TEXT, "Join Stifle! Code: ${code.code}")
                                    }
                                    context.startActivity(Intent.createChooser(shareIntent, "Share"))
                                }) { Icon(Icons.Default.Share, "Share") }
                            }
                        }
                    }
                    if (unusedCodes.size < 5) {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    try {
                                        val response = usersApi.createInvite()
                                        if (response.isSuccessful) inviteCodes = usersApi.getInvites().body() ?: emptyList()
                                    } catch (_: Exception) {}
                                }
                            },
                            shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
                            modifier = Modifier.fillMaxWidth().padding(top = 8.dp)
                        ) { Text("Generate Another") }
                    }
                }

                Spacer(modifier = Modifier.height(32.dp))

                // === NOTIFICATIONS ===
                Text(
                    text = "Reminders",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                
                settings?.let { s ->
                    var enabled by remember { mutableStateOf(s.enabled) }
                    
                    // Permission launcher
                    val launcher = androidx.activity.compose.rememberLauncherForActivityResult(
                        contract = androidx.activity.result.contract.ActivityResultContracts.RequestPermission(),
                        onResult = { isGranted ->
                            if (isGranted) {
                                enabled = true
                                scope.launch {
                                    isSaving = true
                                    try { usersApi.updateTemptationSettings(UpdateTemptationRequest(enabled = true)) } catch (_: Exception) {}
                                    isSaving = false
                                }
                            } else {
                                enabled = false
                                // Show snackbar or alert explaining why (optional)
                            }
                        }
                    )
                    
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Gentle nudges", style = MaterialTheme.typography.bodyLarge)
                            Text("Encouragement to stay focused", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = enabled,
                            onCheckedChange = { newValue ->
                                if (newValue) {
                                    // Check permission
                                    if (app.stifle.notifications.TemptationManager.hasNotificationPermission(context)) {
                                        enabled = true
                                        scope.launch {
                                            isSaving = true
                                            try { usersApi.updateTemptationSettings(UpdateTemptationRequest(enabled = true)) } catch (_: Exception) {}
                                            isSaving = false
                                        }
                                    } else {
                                        // Request permission - specific to Android 13+
                                        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                                            launcher.launch(android.Manifest.permission.POST_NOTIFICATIONS)
                                        } else {
                                            // Should be granted automatically below 13
                                            enabled = true
                                            scope.launch {
                                                isSaving = true
                                                try { usersApi.updateTemptationSettings(UpdateTemptationRequest(enabled = true)) } catch (_: Exception) {}
                                                isSaving = false
                                            }
                                        }
                                    }
                                } else {
                                    enabled = false
                                    scope.launch {
                                        isSaving = true
                                        try { usersApi.updateTemptationSettings(UpdateTemptationRequest(enabled = false)) } catch (_: Exception) {}
                                        isSaving = false
                                    }
                                }
                            }
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))


                // === PRIVACY ===
                Text(
                    text = "Privacy",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)

                profile?.let { p ->
                    var isDiscoverable by remember { mutableStateOf(p.isDiscoverable) }
                    var ghostMode by remember { mutableStateOf(p.ghostMode) }
                    
                    // Discoverable toggle
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Discoverable", style = MaterialTheme.typography.bodyLarge)
                            Text("Allow others to find you by email or username", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = isDiscoverable,
                            onCheckedChange = { newValue ->
                                isDiscoverable = newValue
                                scope.launch {
                                    try { 
                                        usersApi.updateProfile(UpdateProfileRequest(isDiscoverable = newValue)) 
                                        profile = profile?.copy(isDiscoverable = newValue)
                                    } catch (_: Exception) {
                                        isDiscoverable = !newValue
                                        snackbarMessage = "Failed to update privacy settings"
                                    }
                                }
                            }
                        )
                    }
                    
                    // Ghost Mode toggle
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Ghost Mode", style = MaterialTheme.typography.bodyLarge)
                            Text("Hide from leaderboards (show as Anonymous)", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                        Switch(
                            checked = ghostMode,
                            onCheckedChange = { newValue ->
                                ghostMode = newValue
                                scope.launch {
                                    try { 
                                        usersApi.updateProfile(UpdateProfileRequest(ghostMode = newValue)) 
                                        profile = profile?.copy(ghostMode = newValue)
                                        snackbarMessage = if (newValue) "Ghost mode enabled" else "Ghost mode disabled"
                                    } catch (_: Exception) {
                                        ghostMode = !newValue
                                        snackbarMessage = "Failed to update ghost mode"
                                    }
                                }
                            }
                        )
                    }
                }
                
                // Export Data button
                var isExporting by remember { mutableStateOf(false) }
                Row(
                   modifier = Modifier.fillMaxWidth().clickable(enabled = !isExporting) { 
                       isExporting = true
                       scope.launch {
                           try {
                               val response = usersApi.exportData()
                               if (response.isSuccessful) {
                                   val data = response.body()
                                   // Convert to pretty JSON
                                   val gson = com.google.gson.GsonBuilder().setPrettyPrinting().create()
                                   val json = gson.toJson(data)
                                   
                                   // Save to app's cache directory (no permissions needed)
                                   val timestamp = java.text.SimpleDateFormat("yyyyMMdd_HHmmss", java.util.Locale.US).format(java.util.Date())
                                   val filename = "stifle_export_$timestamp.json"
                                   val file = java.io.File(context.cacheDir, filename)
                                   file.writeText(json)
                                   
                                   // Share the file using FileProvider
                                   val uri = androidx.core.content.FileProvider.getUriForFile(
                                       context,
                                       "${context.packageName}.fileprovider",
                                       file
                                   )
                                   val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                       type = "application/json"
                                       putExtra(Intent.EXTRA_STREAM, uri)
                                       addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                                   }
                                   context.startActivity(Intent.createChooser(shareIntent, "Export Data"))
                                   snackbarMessage = "Opening share dialog..."
                               } else {
                                   snackbarMessage = "Failed to export data: ${response.code()}"
                               }
                           } catch (e: Exception) {
                               snackbarMessage = "Error exporting data: ${e.message}"
                               android.util.Log.e("SettingsScreen", "Export failed", e)
                           }
                           isExporting = false
                       }
                   }.padding(vertical = 12.dp),
                   horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Column {
                        Text("Export My Data", style = MaterialTheme.typography.bodyLarge)
                        Text("Share all your data as JSON", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    if (isExporting) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.rotate(180f))
                    }
                }
                
                var showBlockedDialog by remember { mutableStateOf(false) }
                Row(
                   modifier = Modifier.fillMaxWidth().clickable { showBlockedDialog = true }.padding(vertical = 12.dp),
                   horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Manage Blocking", style = MaterialTheme.typography.bodyLarge)
                    Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.rotate(180f))
                }
                
                if (showBlockedDialog) {
                    ManageBlockingDialog(
                        friendsRepository = friendsRepository,
                        onDismiss = { showBlockedDialog = false }
                    )
                }

                Spacer(modifier = Modifier.height(32.dp))

                // === SECURITY ===
                Text(
                    text = "Security",
                    style = MaterialTheme.typography.headlineSmall,
                    fontFamily = androidx.compose.ui.text.font.FontFamily.Serif
                )
                Divider(modifier = Modifier.padding(vertical = 12.dp), color = MaterialTheme.colorScheme.outlineVariant)
                
                Row(
                    modifier = Modifier.fillMaxWidth().clickable { showChangeEmailDialog = true }.padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Change Email", style = MaterialTheme.typography.bodyLarge)
                    Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.rotate(180f))
                }
                Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha=0.5f))
                 Row(
                    modifier = Modifier.fillMaxWidth().clickable { showChangePasswordDialog = true }.padding(vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text("Change Password", style = MaterialTheme.typography.bodyLarge)
                    Icon(Icons.Default.ArrowBack, contentDescription = null, modifier = Modifier.rotate(180f))
                }
                
                Spacer(modifier = Modifier.height(32.dp))

                OutlinedButton(
                    onClick = onLogout,
                    shape = androidx.compose.foundation.shape.RoundedCornerShape(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Sign Out") }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                TextButton(
                    onClick = { showDeleteDialog = true },
                    modifier = Modifier.fillMaxWidth(),
                    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) { Text("Delete Account") }
                
                Spacer(modifier = Modifier.height(32.dp))
            }
    }
    
    // Edit username dialog
    if (showEditUsernameDialog) {
        var newUsername by remember { mutableStateOf(profile?.username ?: "") }
        var saving by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        
        AlertDialog(
            onDismissRequest = { showEditUsernameDialog = false },
            title = { Text("Edit Username") },
            text = {
                Column {
                    OutlinedTextField(
                        value = newUsername,
                        onValueChange = { newUsername = it; error = null },
                        label = { Text("Username") },
                        singleLine = true
                    )
                    error?.let {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        saving = true
                        scope.launch {
                            try {
                                val response = usersApi.updateProfile(UpdateProfileRequest(username = newUsername))
                                if (response.isSuccessful) {
                                    profile = profile?.copy(username = newUsername)
                                    showEditUsernameDialog = false
                                } else {
                                    error = "Username may be taken"
                                    saving = false
                                }
                            } catch (e: Exception) {
                                error = e.message
                                saving = false
                            }
                        }
                    },
                    enabled = newUsername.isNotBlank() && newUsername.length >= 3 && !saving
                ) {
                    Text("Save")
                }
            },
            dismissButton = {
                TextButton(onClick = { showEditUsernameDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Delete account confirmation dialog
    if (showDeleteDialog) {
        var deleting by remember { mutableStateOf(false) }
        
        AlertDialog(
            onDismissRequest = { if (!deleting) showDeleteDialog = false },
            title = { Text("Delete Account?") },
            text = {
                Text("This will permanently delete your account and all data. This cannot be undone.")
            },
            confirmButton = {
                Button(
                    onClick = {
                        deleting = true
                        scope.launch {
                            try {
                                val response = usersApi.deleteAccount()
                                if (response.isSuccessful) {
                                    onLogout()
                                }
                            } catch (_: Exception) {}
                            deleting = false
                        }
                    },
                    enabled = !deleting,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.error
                    )
                ) {
                    if (deleting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp,
                            color = MaterialTheme.colorScheme.onError
                        )
                    } else {
                        Text("Delete Forever")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showDeleteDialog = false },
                    enabled = !deleting
                ) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Change Password Dialog
    if (showChangePasswordDialog) {
        var currentPassword by remember { mutableStateOf("") }
        var newPassword by remember { mutableStateOf("") }
        var confirmPassword by remember { mutableStateOf("") }
        var saving by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        
        AlertDialog(
            onDismissRequest = { if (!saving) showChangePasswordDialog = false },
            title = { Text("Change Password") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    OutlinedTextField(
                        value = currentPassword,
                        onValueChange = { currentPassword = it; error = null },
                        label = { Text("Current Password") },
                        singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation()
                    )
                    OutlinedTextField(
                        value = newPassword,
                        onValueChange = { newPassword = it; error = null },
                        label = { Text("New Password") },
                        singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        supportingText = if (newPassword.isNotEmpty() && newPassword.length < 8) {
                            { Text("At least 8 characters", color = MaterialTheme.colorScheme.error) }
                        } else null
                    )
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it; error = null },
                        label = { Text("Confirm Password") },
                        singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        isError = confirmPassword.isNotEmpty() && newPassword != confirmPassword
                    )
                    error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (newPassword != confirmPassword) {
                            error = "Passwords don't match"
                            return@Button
                        }
                        saving = true
                        scope.launch {
                            try {
                                val response = usersApi.changePassword(
                                    mapOf(
                                        "currentPassword" to currentPassword,
                                        "newPassword" to newPassword
                                    )
                                )
                                if (response.isSuccessful) {
                                    showChangePasswordDialog = false
                                    snackbarMessage = "Password changed successfully"
                                } else {
                                    error = "Current password is incorrect"
                                    saving = false
                                }
                            } catch (e: Exception) {
                                error = e.message ?: "Error changing password"
                                saving = false
                            }
                        }
                    },
                    enabled = currentPassword.isNotBlank() && 
                              newPassword.length >= 8 && 
                              confirmPassword.isNotBlank() && 
                              !saving
                ) {
                    if (saving) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Change Password")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showChangePasswordDialog = false },
                    enabled = !saving
                ) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Change Email Dialog
    if (showChangeEmailDialog) {
        var newEmail by remember { mutableStateOf("") }
        var password by remember { mutableStateOf("") }
        var saving by remember { mutableStateOf(false) }
        var error by remember { mutableStateOf<String?>(null) }
        
        AlertDialog(
            onDismissRequest = { if (!saving) showChangeEmailDialog = false },
            title = { Text("Change Email") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(
                        "Current: ${profile?.email ?: "—"}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    OutlinedTextField(
                        value = newEmail,
                        onValueChange = { newEmail = it; error = null },
                        label = { Text("New Email") },
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(
                            keyboardType = androidx.compose.ui.text.input.KeyboardType.Email
                        )
                    )
                    OutlinedTextField(
                        value = password,
                        onValueChange = { password = it; error = null },
                        label = { Text("Current Password") },
                        singleLine = true,
                        visualTransformation = androidx.compose.ui.text.input.PasswordVisualTransformation(),
                        supportingText = { Text("Required for security") }
                    )
                    error?.let {
                        Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        saving = true
                        scope.launch {
                            try {
                                val response = usersApi.changeEmail(
                                    mapOf(
                                        "email" to newEmail,
                                        "password" to password
                                    )
                                )
                                if (response.isSuccessful) {
                                    profile = profile?.copy(email = newEmail)
                                    showChangeEmailDialog = false
                                    snackbarMessage = "Email changed successfully"
                                } else {
                                    error = "Invalid password or email already in use"
                                    saving = false
                                }
                            } catch (e: Exception) {
                                error = e.message ?: "Error changing email"
                                saving = false
                            }
                        }
                    },
                    enabled = newEmail.isNotBlank() && 
                              newEmail.contains("@") && 
                              password.isNotBlank() && 
                              !saving
                ) {
                    if (saving) {
                        CircularProgressIndicator(modifier = Modifier.size(16.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Change Email")
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showChangeEmailDialog = false },
                    enabled = !saving
                ) {
                    Text("Cancel")
                }
            }
        )
    }
    
    // Show snackbar for messages
    LaunchedEffect(snackbarMessage) {
        snackbarMessage?.let {
            snackbarHostState.showSnackbar(it)
            snackbarMessage = null
        }
    }
}

@Composable
fun ManageBlockingDialog(
    friendsRepository: FriendsRepository,
    onDismiss: () -> Unit
) {
    var blockedUsers by remember { mutableStateOf<List<app.stifle.network.BlockedUser>>(emptyList()) }
    var isLoading by remember { mutableStateOf(true) }
    var showBlockNewDialog by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    
    // Function to refresh list
    fun refreshBlockedUsers() {
        scope.launch {
            isLoading = true
            val result = friendsRepository.getBlockedUsers()
            if (result is app.stifle.data.repository.Result.Success) {
                blockedUsers = result.data
            }
            isLoading = false
        }
    }

    LaunchedEffect(Unit) {
        refreshBlockedUsers()
    }
    
    if (showBlockNewDialog) {
        BlockUserDialog(
            friendsRepository = friendsRepository,
            onDismiss = { 
                showBlockNewDialog = false
                refreshBlockedUsers() // Refresh when coming back
            }
        )
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { 
            Row(
                modifier = Modifier.fillMaxWidth(), 
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Blocked Users", fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
                IconButton(onClick = { showBlockNewDialog = true }) {
                    Icon(Icons.Default.Add, "Block Someone")
                }
            }
        },
        text = {
            if (isLoading) {
                Box(modifier = Modifier.fillMaxWidth().height(100.dp), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
            } else if (blockedUsers.isEmpty()) {
                Text("No blocked users. Tap + to block someone.")
            } else {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    blockedUsers.forEach { user ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(user.username, style = MaterialTheme.typography.bodyLarge)
                            TextButton(
                                onClick = {
                                    scope.launch {
                                        val result = friendsRepository.unblockUser(user.id)
                                        if (result is app.stifle.data.repository.Result.Success) {
                                            blockedUsers = blockedUsers.filter { it.id != user.id }
                                        }
                                    }
                                }
                            ) { Text("Unblock") }
                        }
                        Divider(color = MaterialTheme.colorScheme.outlineVariant.copy(alpha=0.5f))
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Close") }
        }
    )
}

@Composable
fun BlockUserDialog(
    friendsRepository: FriendsRepository,
    onDismiss: () -> Unit
) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Friends", "Search")
    val scope = rememberCoroutineScope()
    
    AlertDialog(
        onDismissRequest = onDismiss,
        text = {
            Column {
                TabRow(selectedTabIndex = selectedTab) {
                    tabs.forEachIndexed { index, title ->
                        Tab(
                            selected = selectedTab == index,
                            onClick = { selectedTab = index },
                            text = { Text(title) },
                            icon = { 
                                Icon(
                                    if (index == 0) Icons.Default.Person else Icons.Default.Search,
                                    contentDescription = null
                                ) 
                            }
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                if (selectedTab == 0) {
                    // Friends List
                    var friends by remember { mutableStateOf<List<app.stifle.network.FriendLeaderboardEntry>>(emptyList()) }
                    var isLoading by remember { mutableStateOf(true) }
                    
                    LaunchedEffect(Unit) {
                        val result = friendsRepository.getLeaderboard()
                        if (result is app.stifle.data.repository.Result.Success) {
                            // Filter out current user from the list
                            friends = result.data.filter { !it.isCurrentUser }
                        }
                        isLoading = false
                    }
                    
                    if (isLoading) {
                        CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                    } else if (friends.isEmpty()) {
                        Text("No friends found.")
                    } else {
                        LazyColumn(modifier = Modifier.height(300.dp)) {
                            items(friends) { friend ->
                                Row(
                                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(friend.username, style = MaterialTheme.typography.bodyLarge)
                                    Button(
                                        onClick = {
                                            scope.launch {
                                                friendsRepository.blockUser(friend.id) // Fixed: pass ID string directly
                                                onDismiss()
                                            }
                                        },
                                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                                    ) { Text("Block") }
                                }
                                Divider()
                            }
                        }
                    }
                } else {
                    // Search
                    var query by remember { mutableStateOf("") }
                    var searchResults by remember { mutableStateOf<List<app.stifle.network.FriendSearchResult>>(emptyList()) }
                    var isSearching by remember { mutableStateOf(false) }
                    
                    Column {
                        OutlinedTextField(
                            value = query,
                            onValueChange = { query = it },
                            placeholder = { Text("Username or Email") },
                            modifier = Modifier.fillMaxWidth(),
                            trailingIcon = {
                                IconButton(onClick = {
                                    if (query.isNotBlank()) {
                                        isSearching = true
                                        scope.launch {
                                            val result = friendsRepository.searchUsers(query)
                                            if (result is app.stifle.data.repository.Result.Success) {
                                                searchResults = result.data // Fixed: result.data is the list
                                            }
                                            isSearching = false
                                        }
                                    }
                                }) {
                                    Icon(Icons.Default.Search, "Search")
                                }
                            }
                        )
                        
                        Spacer(modifier = Modifier.height(8.dp))
                        
                        if (isSearching) {
                            CircularProgressIndicator(modifier = Modifier.align(Alignment.CenterHorizontally))
                        } else {
                            LazyColumn(modifier = Modifier.height(240.dp)) {
                                items(searchResults) { user ->
                                    Row(
                                        modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Text(user.username, style = MaterialTheme.typography.bodyLarge)
                                        Button(
                                            onClick = {
                                                scope.launch {
                                                    friendsRepository.blockUser(user.id) // Fixed: pass ID string directly
                                                    onDismiss()
                                                }
                                            },
                                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                                        ) { Text("Block") }
                                    }
                                    Divider()
                                }
                            }
                        }
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
