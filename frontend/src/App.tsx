import { RootLayout } from "@/app/layouts/RootLayout";
import { AppRoutes } from "@/app/router/routes";

export default function App() {
  return (
    <RootLayout>
      <AppRoutes />
    </RootLayout>
  );
}
