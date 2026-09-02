import Image from "next/image";

export function GodziCredit({ variant }: { variant: "login" | "header" }) {
  return (
    <div className={`godzi-credit godzi-credit--${variant}`} aria-label="Built by GODZ-i">
      <span className="godzi-credit__mark" aria-hidden="true">
        <Image src="/brand/godz-i-logo.png" alt="" width={1024} height={1024} />
      </span>
      <span className="godzi-credit__copy">
        <small>Built by</small>
        <strong>GODZ-i</strong>
      </span>
    </div>
  );
}
