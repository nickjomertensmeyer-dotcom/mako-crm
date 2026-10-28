import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
 {ignores:['.next/**','node_modules/**','qa/**','next-env.d.ts']},
 {files:['**/*.ts','**/*.tsx'],extends:[js.configs.recommended,...ts.configs.recommended],rules:{'@typescript-eslint/no-unused-vars':['error',{argsIgnorePattern:'^_'}]}}
);
