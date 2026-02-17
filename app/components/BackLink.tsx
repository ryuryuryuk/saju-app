import Link from 'next/link';

export default function BackLink({ href = '/' }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="이전 페이지로 이동"
      className="focus-ring tap-target mb-6 inline-flex items-center gap-1 text-sm font-medium text-stone-600 transition hover:text-orange-700"
    >
      <span aria-hidden="true">&larr;</span> 돌아가기
    </Link>
  );
}
