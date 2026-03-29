import { createRouter, createRoute, createRootRoute } from "@tanstack/react-router";
import App from "./App";
import Home from "./pages/Home";
import LeagueDetail from "./pages/LeagueDetail";
import Settings from "./pages/Settings";

const rootRoute = createRootRoute({
  component: App,
});

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Home,
});

const leagueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/leagues/$leagueId",
  component: LeagueDetail,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: Settings,
});

const routeTree = rootRoute.addChildren([homeRoute, leagueRoute, settingsRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
