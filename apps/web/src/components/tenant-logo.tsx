/* eslint-disable @next/next/no-img-element -- tenant uploads, any size */

/** A restaurant's logo on a dark screen (login, kitchen). */
export function LogoOnDark({
  name,
  logoUrl,
  logoOnDarkUrl,
  className = "h-10",
}: {
  name: string;
  logoUrl: string | null;
  logoOnDarkUrl: string | null;
  className?: string;
}) {
  if (logoOnDarkUrl) return <img src={logoOnDarkUrl} alt={name} className={`${className} w-auto`} />;
  if (logoUrl)
    return (
      <span className="inline-block rounded-lg bg-white px-3 py-1.5">
        <img src={logoUrl} alt={name} className={`${className} w-auto`} />
      </span>
    );
  return <span className="text-2xl font-bold tracking-tight text-neutral-50">{name}</span>;
}
