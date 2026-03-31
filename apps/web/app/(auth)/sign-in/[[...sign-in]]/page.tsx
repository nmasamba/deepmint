import { SignIn } from "@clerk/nextjs";
import { dark } from "@clerk/themes";

export default function SignInPage() {
  return (
    <SignIn
      appearance={{
        baseTheme: dark,
        variables: {
          colorPrimary: "#2DD4BF",
          colorBackground: "#111827",
          colorInputBackground: "#1A2332",
          colorText: "#E2E8F0",
        },
      }}
    />
  );
}
