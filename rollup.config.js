import { nodeResolve } from "@rollup/plugin-node-resolve";
import commonjs from "@rollup/plugin-commonjs";

export default {
  input: "node_modules/linkedom/esm/index.js",
  output: {
    file: "sources/vendor/linkedom.js",
    format: "es",
  },
  plugins: [nodeResolve(), commonjs()],
};
