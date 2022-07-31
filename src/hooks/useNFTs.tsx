import {
  bundlrStorage,
  keypairIdentity,
  Metaplex,
  Nft,
} from "@metaplex-foundation/js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  GetProgramAccountsFilter,
  Keypair,
  ParsedAccountData,
  PublicKey,
} from "@solana/web3.js";
import base58 from "bs58";
import { useCallback, useMemo, useState } from "react";
import nacl from "tweetnacl";
import { definitions } from "../types/supabase";
import { supabase } from "../utils/supabase-client";

type VerifyNameReturn = { name: string; verified: boolean };

export type NftWithVerifiedName = Nft & VerifyNameReturn;

const wallet = Keypair.generate();

export default function useNFTs() {
  const { publicKey } = useWallet();
  const { connection } = useConnection();

  const [nfts, setNfts] = useState<NftWithVerifiedName[]>([]);

  const metaplex = Metaplex.make(connection)
    .use(keypairIdentity(wallet))
    .use(bundlrStorage());

  const getNfts = useCallback(
    async ({ mintAddress }: { mintAddress: string }) => {
      try {
        return await metaplex
          .nfts()
          .findByMint(new PublicKey(mintAddress))
          .run();
      } catch (e) {
        console.log(e);
      }
    },
    [metaplex]
  );

  const filters: GetProgramAccountsFilter[] = useMemo(() => {
    return [
      {
        dataSize: 165, //size of account (bytes)
      },
      {
        memcmp: {
          offset: 32, //location of our query in the account (bytes)
          bytes: publicKey as unknown as string, //our search criteria, a base58 encoded string
        },
      },
    ];
  }, [publicKey]);

  const signName = async (name: string, mintAddress?: string) => {
    if (!mintAddress && !publicKey) return;

    try {
      const encodedMessage = new TextEncoder().encode(name);
      const signedMessage = await (window as any).solana.request({
        method: "signMessage",
        params: {
          message: encodedMessage,
          display: "utf8", //hex,utf8
        },
      });

      console.log("signedMessage", signedMessage);

      const { data } = await supabase
        .from<definitions["name_changes"]>("name_changes")
        .select("*")
        .eq("mint_address", mintAddress)
        .single();

      if (!data) {
        await supabase.from<definitions["name_changes"]>("name_changes").upsert(
          {
            public_key: signedMessage.publicKey,
            signature: signedMessage.signature,
            mint_address: mintAddress,
            name,
          },
          { ignoreDuplicates: true, returning: "minimal" }
        );
      } else {
        await supabase.from<definitions["name_changes"]>("name_changes").upsert(
          {
            id: data.id,
            public_key: signedMessage.publicKey,
            signature: signedMessage.signature,
            mint_address: mintAddress,
            name,
          },
          { returning: "minimal" }
        );
      }
    } catch (e) {
      console.log(e);
    }
  };

  const verifyName = useCallback(
    async (mintAddress: string): Promise<VerifyNameReturn | null> => {
      if (!publicKey) return null;

      const { data } = await supabase
        .from<definitions["name_changes"]>("name_changes")
        .select("*")
        .eq("mint_address", mintAddress)
        .single();

      if (!data) return null;

      const { signature, public_key, name } = data;

      const verified = nacl.sign.detached.verify(
        new TextEncoder().encode(name),
        base58.decode(signature as string),
        base58.decode(public_key as string)
      );

      return verified ? { name: name as string, verified } : null;
    },
    [publicKey]
  );
  const getAllNftAccounts = useCallback(async () => {
    try {
      if (!publicKey || !connection) return;

      await connection
        .getParsedProgramAccounts(TOKEN_PROGRAM_ID, {
          filters,
        })
        .then((accounts) => {
          console.log("accounts", accounts);

          accounts?.forEach((account, i) => {
            const parsedAccountInfo = account.account.data as ParsedAccountData;
            const mintAddress: string =
              parsedAccountInfo["parsed"]["info"]["mint"];
            const tokenBalance: number =
              parsedAccountInfo["parsed"]["info"]["tokenAmount"]["uiAmount"];
            //Log results
            console.log(
              `Token Account No. ${i + 1}: ${account.pubkey.toString()}`
            );
            console.log(`--Token Mint: ${mintAddress}`);
            console.log(`--Token Balance: ${tokenBalance}`);

            getNfts({ mintAddress }).then(async (n) => {
              if (!n) return;

              let nft = { ...n, verified: false };
              const res = await verifyName(n.mintAddress.toString());
              if (res) {
                nft = { ...n, ...res };
              }
              setNfts((curr) => [...curr, nft]);
            });
          });
        });
    } catch (error) {
      console.log(error);
    }
  }, [connection, publicKey, filters, getNfts, verifyName]);

  return {
    nfts,
    getAllNftAccounts,
    signName,
    verifyName,
  };
}
