// 引入 React 原生库
// import { createRoot } from "react-dom/client";
import { createRoot } from "./lib/react-dom/ReactDom.js";

import App from "./App.jsx";

// createRoot();

const Root = createRoot(document.getElementById("root"));
Root.render(<App id="testId"/>);

// Root.render(
// 	<div className="container">
// 		<div className="one">
// 			<div className="two">
// 				<p>1</p>
// 				<p>2</p>
// 			</div>
// 			<div className="three">
// 				<p>3</p>
// 				<p>4</p>
// 			</div>
// 		</div>
// 		<p>this is a tes1</p>
// 	</div>
// );
