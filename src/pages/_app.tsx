import "../styles/globals.css";
import type { AppType } from "next/dist/shared/lib/utils";
import { Wallet } from "../components/Wallet";
import { ChakraProvider } from "@chakra-ui/react";

const MyApp: AppType = ({ Component, pageProps }) => {
  return (
    <ChakraProvider>
      <Wallet>
        <Component {...pageProps} />
      </Wallet>
    </ChakraProvider>
  );
};

export default MyApp;
