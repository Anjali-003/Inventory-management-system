import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/api/baseApi";

export const makeStore = () =>
  configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  });

export const store = makeStore();
