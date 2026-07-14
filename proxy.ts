import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = [
  "/dashboard", "/analytics", "/transactions", "/reconciliation", "/accounts",
  "/categories", "/competences", "/recurrences", "/closings", "/vehicles",
  "/fuel", "/settings", "/account", "/admin",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const pathname = request.nextUrl.pathname;
  const isProtected = protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set("redirectTo", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (pathname.startsWith("/admin") && user) {
    const { data: profile } = await supabase.from("profiles").select("role, status").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin" || profile.status !== "active") {
      const deniedUrl = request.nextUrl.clone();
      deniedUrl.pathname = "/dashboard";
      deniedUrl.search = "?error=access_denied";
      return NextResponse.redirect(deniedUrl);
    }
  }

  if (pathname === "/login" && user) {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }
  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*", "/analytics/:path*", "/transactions/:path*", "/reconciliation/:path*",
    "/accounts/:path*", "/categories/:path*", "/competences/:path*", "/recurrences/:path*",
    "/closings/:path*", "/vehicles/:path*", "/fuel/:path*", "/settings/:path*",
    "/account/:path*", "/admin/:path*", "/login",
  ],
};

