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

  const gpa = (() => {
    const graded = (mockUser?.completedCourses.passed ?? []).filter(
      (c) => c.grade != null,
    );
    if (graded.length === 0) return 0;
    return graded.reduce((sum, c) => sum + (c.grade ?? 0), 0) / graded.length;
  })();

  const profileUser =
    session && loggedInUser
      ? {
          ...loggedInUser,
          creditsCompleted: mockUser?.academicProgress.creditsEarned,
          gpa,
        }
      : undefined;

  return <Profile onLogout={handleLogout} loggedInUser={profileUser} />;
}
