import type { Metadata } from "next";
import { UnsubscribeForm } from "./UnsubscribeForm";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

/**
 * Reached from the footer of every digest. The id is opaque and per-subscriber,
 * so the address itself never travels in a URL.
 */
export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-lg font-semibold text-neutral-900">Unsubscribe</h1>
      {id ? (
        <UnsubscribeForm id={id} />
      ) : (
        <p className="mt-2 text-sm text-neutral-600">
          This link is missing its id. Use the unsubscribe link at the bottom of any digest, or
          reply to one and we&rsquo;ll remove you by hand.
        </p>
      )}
    </main>
  );
}
