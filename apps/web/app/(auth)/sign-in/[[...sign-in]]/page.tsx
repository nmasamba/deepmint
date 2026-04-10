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
          colorTextOnPrimaryBackground: "#0A0F1A",
          colorTextSecondary: "#94A3B8",
          colorNeutral: "#E2E8F0",
        },
        elements: {
          socialButtonsBlockButton: {
            backgroundColor: "#1A2332",
            border: "1px solid #2A3A50",
            color: "#E2E8F0",
            "&:hover": {
              backgroundColor: "#243044",
              borderColor: "#2DD4BF",
            },
          },
          socialButtonsBlockButtonText: {
            color: "#E2E8F0",
          },
          // Only invert the Apple logo (black-on-dark is invisible). Google,
          // Facebook, and X ship multicolor / light icons that must NOT be
          // filtered — inverting them produces a white-on-white empty box.
          socialButtonsProviderIcon__apple: {
            filter: "brightness(0) invert(1)",
          },
          dividerLine: {
            backgroundColor: "#2A3A50",
          },
          dividerText: {
            color: "#94A3B8",
          },
          footerActionLink: {
            color: "#2DD4BF",
            "&:hover": { color: "#5EEAD4" },
          },
          headerTitle: {
            color: "#E2E8F0",
          },
          headerSubtitle: {
            color: "#94A3B8",
          },
          card: {
            backgroundColor: "#111827",
            border: "1px solid #1A2233",
          },
          footer: {
            justifyContent: "center",
          },
        },
      }}
    />
  );
}
