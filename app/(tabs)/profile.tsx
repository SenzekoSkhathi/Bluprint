import { useAuth } from "@/contexts/auth-context";
import { useLoggedInUser } from "@/hooks/use-logged-in-user";
import Profile from "@/Pages/Profile";
import { useRouter } from "expo-router";

export default function ProfileScreen() {
  const { logout, session } = useAuth();
  const { loggedInUser, mockUser } = useLoggedInUser();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  const profileUser =
    session && loggedInUser
      ? {
          ...loggedInUser,
          creditsCompleted: mockUser?.academicProgress.creditsEarned,
        }
      : undefined;

  return <Profile onLogout={handleLogout} loggedInUser={profileUser} />;
}
