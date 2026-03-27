import { Component } from "../../core/component/component";

@Component({
  selector: "app-root-home",
  hydrate: "none",
  template:
    "<h1>Nexular Framework</h1>" +
    "<p>Core framework package ready. Build your app in a separate project.</p>",
})
export class RootComponent {}
