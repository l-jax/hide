import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";
import copy from "rollup-plugin-copy";

export default [
  {
    input: "popup/popup.js",
    output: {
      dir: "dist/popup",
      format: "iife",
    },
    plugins: [
      nodeResolve({
        jsnext: true,
        main: true,
        browser: true,
      }),
      commonjs(),
      copy({
        targets: [
          {
            src: ["manifest.json", "images", "popup", "scripts", "style.css"],
            dest: "dist",
          },
        ],
      })
    ],
  },
];
