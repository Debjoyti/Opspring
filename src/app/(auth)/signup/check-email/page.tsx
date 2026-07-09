import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent you a confirmation link. Click it to finish creating your account.
        </CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
}
