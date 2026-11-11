import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { installBasePath } from "./basePath";
installBasePath();
import App from "./App";
import ErrorBoundary from "./ErrorBoundary";
import "./styles.css";
import "./product.css";
import "./audit.css";
import "./experience.css";
import "./auth.css";
import "./account.css";
import "./application-questions.css";
import "./resume-review.css";
import "./pricing.css";
import "./workspace-design.css";
import "./onboarding.css";
import "./app-polish.css";
import "./tokens.css";
const client = new QueryClient({
  defaultOptions: {
    queries: { retry: false, staleTime: 30000, refetchOnWindowFocus: false },
  },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={client}>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </React.StrictMode>,
);
