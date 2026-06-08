declare module "@/legacy/LegacyApp" {
  import type { FC } from "react";
  const LegacyApp: FC;
  export default LegacyApp;
  export function App(): JSX.Element;
}

declare module "@/legacy/LegacyApp.jsx" {
  import type { FC } from "react";
  const LegacyApp: FC;
  export default LegacyApp;
}
