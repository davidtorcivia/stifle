package app.stifle.ui.screens

import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.ContentCopy
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.stifle.network.InviteCode
import app.stifle.network.TemptationSettings
import app.stifle.network.UpdateTemptationRequest
import app.stifle.network.UserProfile
import app.stifle.network.UsersApi
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    usersApi: UsersApi,
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
    
    val scope = rememberCoroutineScope()
    val context = LocalContext.current
    val clipboardManager = LocalClipboardManager.current
    
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
        isLoading = false
    }
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Settings") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { padding ->
        if (isLoading) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp)
            ) {
                Spacer(modifier = Modifier.height(8.dp))
                
                // === PROFILE SECTION ===
                Text(
                    text = "Profile",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        // Username
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Username", style = MaterialTheme.typography.labelMedium)
                                Text(
                                    text = profile?.username ?: "—",
                                    style = MaterialTheme.typography.bodyLarge
                                )
                            }
                            TextButton(onClick = { showEditUsernameDialog = true }) {
                                Text("Edit")
                            }
                        }
                        
                        Divider(modifier = Modifier.padding(vertical = 12.dp))
                        
                        // Email (read-only)
                        Column {
                            Text("Email", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = profile?.email ?: "—",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                        
                        Divider(modifier = Modifier.padding(vertical = 12.dp))
                        
                        // Timezone
                        Column {
                            Text("Timezone", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = profile?.timezone ?: "UTC",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // === INVITE FRIENDS SECTION ===
                Text(
                    text = "Invite Friends",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        val unusedCodes = inviteCodes.filter { !it.used }
                        
                        if (unusedCodes.isEmpty()) {
                            Text(
                                "No invite codes available",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Button(
                                onClick = {
                                    scope.launch {
                                        try {
                                            val response = usersApi.createInvite()
                                            if (response.isSuccessful) {
                                                // Refresh invites
                                                val refresh = usersApi.getInvites()
                                                if (refresh.isSuccessful) {
                                                    inviteCodes = refresh.body() ?: emptyList()
                                                }
                                            }
                                        } catch (_: Exception) {}
                                    }
                                }
                            ) {
                                Text("Generate Invite Code")
                            }
                        } else {
                            unusedCodes.take(3).forEach { code ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = code.code,
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                    Row {
                                        IconButton(onClick = {
                                            clipboardManager.setText(AnnotatedString(code.code))
                                        }) {
                                            Icon(Icons.Default.ContentCopy, "Copy")
                                        }
                                        IconButton(onClick = {
                                            val shareIntent = Intent(Intent.ACTION_SEND).apply {
                                                type = "text/plain"
                                                putExtra(Intent.EXTRA_TEXT, 
                                                    "Join me on Stifle! Use invite code: ${code.code}")
                                            }
                                            context.startActivity(Intent.createChooser(shareIntent, "Share invite"))
                                        }) {
                                            Icon(Icons.Default.Share, "Share")
                                        }
                                    }
                                }
                            }
                            
                            if (unusedCodes.size < 5) {
                                Spacer(modifier = Modifier.height(8.dp))
                                OutlinedButton(
                                    onClick = {
                                        scope.launch {
                                            try {
                                                val response = usersApi.createInvite()
                                                if (response.isSuccessful) {
                                                    val refresh = usersApi.getInvites()
                                                    if (refresh.isSuccessful) {
                                                        inviteCodes = refresh.body() ?: emptyList()
                                                    }
                                                }
                                            } catch (_: Exception) {}
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Text("Generate Another")
                                }
                            }
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // === NOTIFICATIONS SECTION ===
                Text(
                    text = "Gentle Reminders",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                settings?.let { s ->
                    var enabled by remember { mutableStateOf(s.enabled) }
                    
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Enable reminders", style = MaterialTheme.typography.bodyLarge)
                                Text(
                                    "Encouraging nudges to help you stay focused",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Switch(
                                checked = enabled,
                                onCheckedChange = { newValue ->
                                    enabled = newValue
                                    scope.launch {
                                        isSaving = true
                                        try {
                                            usersApi.updateTemptationSettings(
                                                UpdateTemptationRequest(enabled = newValue)
                                            )
                                        } catch (_: Exception) {}
                                        isSaving = false
                                    }
                                }
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(24.dp))
                
                // === ACCOUNT SECTION ===
                Text(
                    text = "Account",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Spacer(modifier = Modifier.height(8.dp))
                
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        OutlinedButton(
                            onClick = onLogout,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Text("Sign Out")
                        }
                        
                        Spacer(modifier = Modifier.height(12.dp))
                        
                        OutlinedButton(
                            onClick = { showDeleteDialog = true },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(
                                contentColor = MaterialTheme.colorScheme.error
                            )
                        ) {
                            Text("Delete Account")
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(32.dp))
                
                if (isSaving) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
            }
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
                                val response = usersApi.updateProfile(mapOf("username" to newUsername))
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
}
