import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoginForm } from './login-form';

export const metadata = { title: 'Sign in · Trading Hub' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Trading Hub</CardTitle>
          <CardDescription>Sign in with a magic link.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === 'not-allowed' && (
            <p role="alert" className="text-destructive text-sm">
              This email can't sign in.
            </p>
          )}
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
