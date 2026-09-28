import { DemoFooterMark, Wordmark } from "@/components/brand";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex h-16 max-w-[1240px] items-center px-5">
          <Wordmark />
          <span className="ml-auto">
            <LocaleSwitcher />
          </span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 py-12">{children}</main>
      <footer className="px-5 py-5 text-center">
        <DemoFooterMark />
      </footer>
    </div>
  );
}
