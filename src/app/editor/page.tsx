import { EditorClient } from "@/components/editor-client";
import { AuthForm } from "@/components/auth-form";
import { getAuthenticatedUser } from "@/lib/auth";

export default async function EditorPage() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return <AuthForm />;
  }

  return <EditorClient />;
}