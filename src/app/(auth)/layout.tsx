import { Wordmark } from "@/components/brand";
import { DemoFooterMark } from "@/components/demo-mark";
import { LocaleSwitcher } from "@/components/locale-switcher";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-line-strong bg-white">
        <div className="flex h-14 items-center px-5 xl:h-[90px] xl:px-10">
          <Wordmark size={28} />
          <span className="ml-auto">
            <LocaleSwitcher />
          </span>
        </div>
      </header>
      <main className="flex flex-1 items-start justify-center px-5 pb-16 pt-12 sm:pt-20">{children}</main>
      <footer className="bg-band px-5 py-5 text-center">
        <DemoFooterMark />
      </footer>
    </div>
  );
}
