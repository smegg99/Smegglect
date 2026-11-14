// main.go
package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"

	"smegglect/fixtures/wails/internal/desk"
	"smegglect/fixtures/wails/services"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := application.New(application.Options{
		Name: "Smegglect Desk",
		Services: append([]application.Service{
			application.NewService(services.NewDeskService(&desk.Counter{})),
		}, debugServices()...),
		Assets: application.AssetOptions{Handler: application.AssetFileServerFS(assets)},
		Linux:  application.LinuxOptions{ProgramName: "smegglect-desk"},
	})
	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Smegglect Desk",
		Width:     1100,
		Height:    720,
		Frameless: true,
		URL:       "/",
	})
	if err := app.Run(); err != nil {
		log.Fatal(err)
	}
}
