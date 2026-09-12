import { ActionMailApp } from "./actionmail-app";
import { chatGPTSignOutPath, requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await requireChatGPTUser("/");
  return (
    <ActionMailApp
      user={{ displayName: user.displayName, email: user.email }}
      signOutHref={chatGPTSignOutPath("/")}
    />
  );
}
