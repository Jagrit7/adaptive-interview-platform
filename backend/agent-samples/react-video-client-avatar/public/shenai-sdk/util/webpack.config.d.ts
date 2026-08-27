import webpack = require("webpack");
export let entry: string;
export namespace module {
    let rules: ({
        test: RegExp;
        use: string;
        exclude: RegExp;
        type?: undefined;
    } | {
        test: RegExp;
        type: string;
        use?: undefined;
        exclude?: undefined;
    })[];
}
export namespace resolve {
    let extensions: string[];
}
export namespace experiments {
    let outputModule: boolean;
}
export namespace performance {
    let hints: string;
    let maxAssetSize: number;
    let maxEntrypointSize: number;
}
export namespace output {
    let filename: string;
    let publicPath: string;
    let path: string;
    let libraryTarget: string;
}
export let plugins: webpack.DefinePlugin[];
