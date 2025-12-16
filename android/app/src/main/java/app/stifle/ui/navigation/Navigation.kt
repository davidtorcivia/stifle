package app.stifle.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import app.stifle.data.AppContainer
import app.stifle.ui.screens.GroupsScreen
import app.stifle.ui.screens.HomeScreen
import app.stifle.ui.screens.LoginScreen
import app.stifle.ui.screens.RegisterScreen
import app.stifle.ui.screens.SettingsScreen

@Composable
fun StifleNavHost(
    container: AppContainer,
    startDestination: String
) {
    val navController = rememberNavController()
    
    val onLogout: () -> Unit = {
        navController.navigate("login") {
            popUpTo(0) { inclusive = true }
        }
    }
    
    NavHost(
        navController = navController,
        startDestination = startDestination
    ) {
        composable("login") {
            LoginScreen(
                authRepository = container.authRepository,
                onLoginSuccess = {
                    navController.navigate("home") {
                        popUpTo("login") { inclusive = true }
                    }
                },
                onNavigateToRegister = {
                    navController.navigate("register")
                }
            )
        }
        
        composable("register") {
            RegisterScreen(
                authRepository = container.authRepository,
                onRegisterSuccess = {
                    navController.navigate("home") {
                        popUpTo("login") { inclusive = true }
                    }
                },
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
        
        composable("home") {
            HomeScreen(
                eventRepository = container.eventRepository,
                authRepository = container.authRepository,
                usersApi = container.usersApi,
                onNavigateToGroups = {
                    navController.navigate("groups")
                },
                onNavigateToSettings = {
                    navController.navigate("settings")
                },
                onLogout = onLogout
            )
        }
        
        composable("groups") {
            GroupsScreen(
                groupRepository = container.groupRepository,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
        
        composable("settings") {
            SettingsScreen(
                usersApi = container.usersApi,
                onNavigateBack = {
                    navController.popBackStack()
                },
                onLogout = onLogout
            )
        }
    }
}
