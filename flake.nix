{
  description = "Minecraft";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
  };

  outputs =
    { nixpkgs, ... }:

    let
      inherit (nixpkgs) lib;

      systems = lib.systems.flakeExposed;
      forAllSystems = lib.genAttrs systems;
    in
    {
      devShells = forAllSystems (
        system:
        let
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfree = true;
          };
        in
        {
          default = pkgs.mkShell {
            __GL_THREADED_OPTIMIZATIONS = 0;
            LD_LIBRARY_PATH = lib.makeLibraryPath (
              with pkgs;
              [
                (lib.getLib stdenv.cc.cc)

                ## native versions
                glfw3-minecraft
                openal

                ## openal
                alsa-lib
                libjack2
                libpulseaudio
                pipewire

                ## glfw
                libGL
                libx11
                libxcursor
                libxext
                libxrandr
                libxxf86vm

                ## Old minecraft (pre-1.8)
                libxrender
                libxtst
                libxi

                udev # oshi

                flite # Text to speech (Otherwise minecraft will log an error every time it launches)
              ]
            );
          };
        }
      );
    };
}
