import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { resolveVisitorLocale } from "@/lib/locale-resolution";
import { lookupProspectLocale } from "@/lib/report-locale";
import { LOCALE_COOKIE } from "./config";

// QUICK-260730-oiy: resolveVisitorLocale() never rejects, so this function
// cannot 500 the site regardless of what the cookie, path, header, or
// Supabase lookup do.
export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const headerList = headers();

  const locale = await resolveVisitorLocale({
    cookieLocale: cookieStore.get(LOCALE_COOKIE)?.value,
    pathname: headerList.get("x-pathname"),
    acceptLanguage: headerList.get("accept-language"),
    lookupProspectLocale,
  });

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
