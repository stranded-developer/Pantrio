import Link from "next/link";
import { requirePlatformAdminPage } from "@/lib/auth";
import { NewRestaurantForm } from "./form";

export default async function NewRestaurantPage() {
  await requirePlatformAdminPage();
  return (
    <div className="max-w-2xl space-y-4">
      <Link href="/admin" className="text-sm text-neutral-500 hover:underline">
        ← Restaurants
      </Link>
      <h1 className="text-2xl font-semibold text-neutral-900">New restaurant</h1>
      <NewRestaurantForm />
    </div>
  );
}
