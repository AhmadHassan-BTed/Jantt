import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";

const PAGE_SIZE = 48;

/** Keep counting, filtering and bulk actions plan-wide while mounting phone rows as needed. */
export function usePhoneListPage(key: string, enabled: boolean) {
  const [page, setPage] = useState({ key, limit: PAGE_SIZE });
  const limit = enabled ? (page.key === key ? page.limit : PAGE_SIZE) : Infinity;
  const loadMore = useCallback(() => {
    startTransition(() => setPage(previous => ({
      key, limit: (previous.key === key ? previous.limit : PAGE_SIZE) + PAGE_SIZE
    })));
  }, [key]);
  return { limit, loadMore };
}

export function MoreTaskRows({ count, limit, onMore }: { count: number; limit: number; onMore: () => void }) {
  const { t } = useI18n();
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const target = button.current;
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) {
        observer.disconnect();
        onMore();
      }
    }, { rootMargin: "0px 0px 200px 0px" });
    observer.observe(target);
    return () => observer.disconnect();
  }, [count, limit, onMore]);
  if (count <= limit) return null;
  return <button ref={button} type="button" className="load-task-page" onClick={onMore}>
    {t("list.showMore")} <span>{t("list.showMoreCount", { shown: limit, total: count })}</span>
  </button>;
}

