import { Module } from "./core/module/module";
import { RootComponent } from "./modules/root/root.component";

@Module({
  components: [RootComponent],
  providers: [],
})
export class AppModule {}
